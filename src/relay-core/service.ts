import type {
  Connection,
  CoreMethod,
  CoreMethodMap,
  LogEntry,
  ProxyGroup,
  RelaySettings,
  RelaySnapshot,
} from '../core/types'
import type { MihomoConnection, MihomoProxy, MihomoSnapshot } from './mihomoClient'
import { MihomoProcess } from './mihomoProcess'

const bytesPerGiB = 1024 ** 3
const bytesPerMiB = 1024 ** 2

function duration(milliseconds: number, includeHours = true) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const units = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0'))
  return (includeHours || hours > 0 ? units : units.slice(1)).join(':')
}

function locationFromName(name: string) {
  const flag = Array.from(name).find((character) => /\p{Regional_Indicator}/u.test(character))
  if (flag) {
    const flags = Array.from(name).filter((character) => /\p{Regional_Indicator}/u.test(character)).slice(0, 2)
    if (flags.length === 2) {
      return flags.map((character) => String.fromCharCode(character.codePointAt(0)! - 127397)).join('')
    }
  }
  const code = name.toUpperCase().match(/(?:^|[^A-Z])(HK|TW|JP|SG|US|UK|DE|FR|CA|AU|KR)(?:[^A-Z]|$)/)
  return code?.[1] ?? '--'
}

function proxyLatency(proxy: MihomoProxy) {
  const delay = proxy.history?.at(-1)?.delay
  return typeof delay === 'number' && delay > 0 ? delay : null
}

function asConnection(connection: MihomoConnection): Connection {
  const metadata = connection.metadata ?? {}
  const destination = metadata.host || metadata.destinationIP || 'unknown'
  const port = metadata.destinationPort ? `:${metadata.destinationPort}` : ''
  const started = connection.start ? Date.parse(connection.start) : Date.now()
  return {
    id: connection.id,
    host: `${destination}${port}`,
    process: metadata.process || metadata.processPath?.split(/[\\/]/).at(-1) || 'unknown',
    upload: Math.round((connection.upload ?? 0) / 1024),
    download: Math.round((connection.download ?? 0) / 1024),
    rule: connection.rule || 'MATCH',
    chain: connection.chains?.join(' → ') || 'DIRECT',
    duration: duration(Date.now() - (Number.isNaN(started) ? Date.now() : started), false),
  }
}

export class RelayCoreService {
  private readonly process: MihomoProcess
  private logs: LogEntry[] = []
  private settings: RelaySettings = {
    systemProxy: false,
    tun: false,
    allowLan: false,
    ipv6: false,
    mode: 'rule',
  }
  private delays = new Map<string, number>()
  private previousTotals?: { at: number; upload: number; download: number }

  constructor() {
    this.process = new MihomoProcess((level, message) => this.pushLog(level, message))
    this.pushLog('info', 'Relay Core process started')
  }

  async autoStart() {
    if (process.env.RELAY_MIHOMO_AUTO_START === '0') return
    try {
      await this.process.start()
    } catch (error) {
      this.pushLog('error', error instanceof Error ? error.message : String(error))
    }
  }

  stop() {
    return this.process.stop()
  }

  reportError(message: string) {
    this.pushLog('error', message)
  }

  async handle<K extends CoreMethod>(
    method: K,
    argumentsValue: CoreMethodMap[K]['arguments'],
    signal?: AbortSignal,
  ): Promise<CoreMethodMap[K]['result']> {
    switch (method) {
      case 'core.snapshot':
        break
      case 'core.set-running': {
        const { running } = argumentsValue as CoreMethodMap['core.set-running']['arguments']
        if (running) await this.process.start(signal)
        else await this.process.stop()
        break
      }
      case 'proxy.select': {
        const { groupId, nodeId } = argumentsValue as CoreMethodMap['proxy.select']['arguments']
        await this.process.client.selectProxy(groupId, nodeId, signal)
        this.pushLog('info', `${groupId} switched to ${nodeId}`)
        break
      }
      case 'proxy.test': {
        const { groupId } = argumentsValue as CoreMethodMap['proxy.test']['arguments']
        const result = await this.process.client.testGroup(groupId, signal)
        Object.entries(result).forEach(([name, value]) => this.delays.set(name, value))
        this.pushLog('debug', `Completed latency test for ${groupId}`)
        break
      }
      case 'profile.activate': {
        const { profileId } = argumentsValue as CoreMethodMap['profile.activate']['arguments']
        if (profileId !== 'runtime') throw new Error('Profile management is not available until Phase 3')
        break
      }
      case 'connection.close': {
        const { connectionId } = argumentsValue as CoreMethodMap['connection.close']['arguments']
        await this.process.client.closeConnection(connectionId, signal)
        break
      }
      case 'connection.close-all':
        await this.process.client.closeAllConnections(signal)
        this.pushLog('info', 'Closed all active connections')
        break
      case 'settings.update': {
        const next = argumentsValue as CoreMethodMap['settings.update']['arguments']
        if (this.process.running) await this.process.client.updateSettings(next, signal)
        this.settings = { ...this.settings, ...next }
        this.pushLog('info', 'Runtime settings updated')
        break
      }
      case 'logs.clear':
        this.logs = []
        break
      default:
        throw new Error(`Unsupported core method: ${method}`)
    }

    return await this.snapshot(signal) as CoreMethodMap[K]['result']
  }

  async snapshot(signal?: AbortSignal): Promise<RelaySnapshot> {
    if (!this.process.running) return this.stoppedSnapshot()
    const source = await this.process.client.snapshot(signal)
    return this.mapSnapshot(source)
  }

  private stoppedSnapshot(): RelaySnapshot {
    this.previousTotals = undefined
    return {
      status: { running: false, version: 'Mihomo unavailable', uptime: '00:00:00' },
      metrics: {
        uploadSpeed: 0,
        downloadSpeed: 0,
        uploadTotal: 0,
        downloadTotal: 0,
        memory: 0,
        connections: 0,
      },
      proxyGroups: [],
      profiles: [],
      connections: [],
      logs: [...this.logs],
      settings: { ...this.settings },
    }
  }

  private mapSnapshot(source: MihomoSnapshot): RelaySnapshot {
    const proxies = source.proxies.proxies ?? {}
    const groups = this.mapGroups(proxies)
    const connections = (source.connections.connections ?? []).map(asConnection)
    const upload = source.connections.uploadTotal ?? 0
    const download = source.connections.downloadTotal ?? 0
    const now = Date.now()
    const elapsed = this.previousTotals ? Math.max((now - this.previousTotals.at) / 1000, 0.1) : 0
    const uploadSpeed = this.previousTotals ? Math.max(0, upload - this.previousTotals.upload) / elapsed : 0
    const downloadSpeed = this.previousTotals ? Math.max(0, download - this.previousTotals.download) / elapsed : 0
    this.previousTotals = { at: now, upload, download }
    this.settings = this.settingsFromConfig(source.configs)

    const leafProxyCount = Object.values(proxies).filter((proxy) => !proxy.all).length
    return {
      status: {
        running: true,
        version: `Mihomo ${source.version.version ?? 'unknown'}`,
        uptime: duration(this.process.uptimeMilliseconds),
      },
      metrics: {
        uploadSpeed: Math.round(uploadSpeed / 1024),
        downloadSpeed: Math.round(downloadSpeed / 1024),
        uploadTotal: Number((upload / bytesPerGiB).toFixed(2)),
        downloadTotal: Number((download / bytesPerGiB).toFixed(2)),
        memory: Math.round((source.connections.memory ?? 0) / bytesPerMiB),
        connections: connections.length,
      },
      proxyGroups: groups,
      profiles: [{
        id: 'runtime',
        name: this.process.configName,
        source: 'local',
        active: true,
        updatedAt: new Date().toISOString(),
        proxies: leafProxyCount,
        rules: source.rules.rules?.length ?? 0,
      }],
      connections,
      logs: [...this.logs],
      settings: { ...this.settings },
    }
  }

  private mapGroups(proxies: Record<string, MihomoProxy>): ProxyGroup[] {
    return Object.values(proxies)
      .filter((proxy) => Array.isArray(proxy.all))
      .map((group) => ({
        id: group.name,
        name: group.name,
        kind: group.type.toLowerCase(),
        selectedNodeId: group.now ?? group.all?.[0] ?? '',
        nodes: (group.all ?? []).map((name) => {
          const proxy = proxies[name] ?? { name, type: 'unknown' }
          return {
            id: name,
            name,
            type: proxy.type.toLowerCase(),
            location: locationFromName(name),
            latency: this.delays.get(name) ?? proxyLatency(proxy),
          }
        }),
      }))
  }

  private settingsFromConfig(configs: Record<string, unknown>): RelaySettings {
    const tun = configs.tun && typeof configs.tun === 'object'
      ? (configs.tun as Record<string, unknown>).enable === true
      : this.settings.tun
    const mode = typeof configs.mode === 'string' ? configs.mode.toLowerCase() : this.settings.mode
    return {
      systemProxy: this.settings.systemProxy,
      tun,
      allowLan: typeof configs['allow-lan'] === 'boolean' ? configs['allow-lan'] : this.settings.allowLan,
      ipv6: typeof configs.ipv6 === 'boolean' ? configs.ipv6 : this.settings.ipv6,
      mode: mode === 'global' || mode === 'direct' ? mode : 'rule',
    }
  }

  private pushLog(level: LogEntry['level'], message: string) {
    this.logs = [...this.logs, {
      id: `log-${Date.now()}-${this.logs.length}`,
      level,
      time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      message,
    }].slice(-200)
  }
}
