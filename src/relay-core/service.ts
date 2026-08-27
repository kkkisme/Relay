import type {
  Connection,
  CoreMethod,
  CoreMethodMap,
  DesktopStatus,
  LogEntry,
  ProxyGroup,
  Profile,
  RelaySettings,
  RelaySnapshot,
} from '../core/types'
import { basename, extname } from 'node:path'
import type { MihomoConnection, MihomoProxy, MihomoSnapshot } from './mihomoClient'
import { MihomoProcess } from './mihomoProcess'
import { ProfileStore, type ConfigTarget } from './profileStore'
import { SettingsStore } from './settingsStore'
import { FileLogger } from './fileLogger'
import { DesktopIntegration } from './desktopIntegration'

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
  private readonly desktop: DesktopIntegration
  private readonly profiles: ProfileStore
  private readonly settingsStore: SettingsStore
  private readonly runtimeProfileName: string
  private readonly runtimeProfileUpdatedAt = new Date().toISOString()
  private readonly fileLogger = new FileLogger()
  private logs: LogEntry[] = []
  private settings: RelaySettings
  private delays = new Map<string, number>()
  private delayErrors = new Set<string>()
  private previousTotals?: { at: number; upload: number; download: number }
  private desktopStatus?: DesktopStatus
  private desktopStatusAt = 0
  private desktopInitialized = false

  constructor() {
    this.desktop = new DesktopIntegration()
    this.process = new MihomoProcess(
      (level, message) => this.pushLog(level, message),
      () => void this.handleUnexpectedCoreExit(),
    )
    this.profiles = new ProfileStore((path, homeDirectory, signal) =>
      this.process.validateConfig(path, homeDirectory, signal))
    this.settingsStore = new SettingsStore()
    this.settings = this.settingsStore.get()
    const configuredProfile = process.env.RELAY_MIHOMO_CONFIG
    this.runtimeProfileName = configuredProfile
      ? basename(configuredProfile, extname(configuredProfile))
      : 'Relay Runtime'
    this.pushLog('info', 'Relay Core process started')
  }

  async autoStart() {
    try {
      await this.initializeDesktop()
      if (process.env.RELAY_MIHOMO_AUTO_START === '0') return
      await this.startSelectedProfile()
    } catch (error) {
      this.pushLog('error', error instanceof Error ? error.message : String(error))
    }
  }

  async stop() {
    await this.desktop.disableSystemProxy()
    this.invalidateDesktopStatus()
    await this.process.stop()
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
        if (running) await this.startSelectedProfile(signal)
        else await this.stop()
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
        const before = await this.process.client.snapshot(signal)
        const result = await this.process.client.testGroup(groupId, signal)
        Object.entries(result).forEach(([name, value]) => {
          this.delays.set(name, value)
          this.delayErrors.delete(name)
        })
        const group = before.proxies.proxies?.[groupId]
        group?.all?.forEach((name) => {
          if (!(name in result)) this.delayErrors.add(name)
        })
        this.pushLog('debug', `Completed latency test for ${groupId}`)
        break
      }
      case 'profile.activate': {
        const { profileId } = argumentsValue as CoreMethodMap['profile.activate']['arguments']
        await this.activateProfile(profileId, signal)
        break
      }
      case 'profile.import': {
        const input = argumentsValue as CoreMethodMap['profile.import']['arguments']
        const imported = await this.profiles.importProfile(input, signal)
        this.pushLog('info', `Imported and validated profile ${imported.name}`)
        break
      }
      case 'profile.update': {
        const { profileId } = argumentsValue as CoreMethodMap['profile.update']['arguments']
        await this.updateProfile(profileId, signal)
        break
      }
      case 'profile.rollback': {
        const { profileId } = argumentsValue as CoreMethodMap['profile.rollback']['arguments']
        await this.rollbackProfile(profileId, signal)
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
        await this.updateSettings(next, signal)
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
    if (!this.process.running) return await this.stoppedSnapshot()
    const source = await this.process.client.snapshot(signal)
    return await this.mapSnapshot(source)
  }

  private async stoppedSnapshot(): Promise<RelaySnapshot> {
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
      profiles: this.profileList(),
      connections: [],
      logs: [...this.logs],
      settings: { ...this.settings },
      desktop: await this.getDesktopStatus(),
    }
  }

  private async mapSnapshot(source: MihomoSnapshot): Promise<RelaySnapshot> {
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
      profiles: this.profileList(leafProxyCount, source.rules.rules?.length ?? 0),
      connections,
      logs: [...this.logs],
      settings: { ...this.settings },
      desktop: await this.getDesktopStatus(),
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
            error: this.delayErrors.has(name) ? 'Latency test failed' : undefined,
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
      launchAtLogin: this.settings.launchAtLogin,
    }
  }

  private async startSelectedProfile(signal?: AbortSignal) {
    const target = this.profiles.activeConfig()
    await this.launch(target, signal)
  }

  private async activateProfile(profileId: string, signal?: AbortSignal) {
    const previous = this.profiles.activeConfig()
    const next = profileId === 'runtime'
      ? this.profiles.activate(undefined)
      : this.profiles.activate(profileId)
    if (!this.process.running) {
      this.pushLog('info', `Selected profile ${next?.name ?? this.runtimeProfileName}`)
      return
    }

    await this.process.stop()
    try {
      await this.launch(next, signal)
      this.pushLog('info', `Activated profile ${next?.name ?? this.runtimeProfileName}`)
    } catch (error) {
      this.profiles.activate(previous?.profileId)
      await this.restoreProcess(previous)
      throw new Error(`Profile activation failed; previous profile restored. ${this.errorMessage(error)}`)
    }
  }

  private async updateProfile(profileId: string, signal?: AbortSignal) {
    const previous = this.profiles.config(profileId)
    const next = await this.profiles.update(profileId, signal)
    if (this.process.running && this.profiles.activeConfig()?.profileId === profileId) {
      await this.process.stop()
      try {
        await this.launch(next, signal)
      } catch (error) {
        this.profiles.selectRevision(profileId, previous.revision)
        await this.restoreProcess(previous)
        throw new Error(`Profile update failed; revision ${previous.revision} restored. ${this.errorMessage(error)}`)
      }
    }
    this.pushLog('info', `Updated profile ${next.name} to revision ${next.revision}`)
  }

  private async rollbackProfile(profileId: string, signal?: AbortSignal) {
    const previous = this.profiles.config(profileId)
    const next = this.profiles.rollback(profileId)
    if (this.process.running && this.profiles.activeConfig()?.profileId === profileId) {
      await this.process.stop()
      try {
        await this.launch(next, signal)
      } catch (error) {
        this.profiles.selectRevision(profileId, previous.revision)
        await this.restoreProcess(previous)
        throw new Error(`Profile rollback failed; revision ${previous.revision} restored. ${this.errorMessage(error)}`)
      }
    }
    this.pushLog('warning', `Rolled back profile ${next.name} to revision ${next.revision}`)
  }

  private async restoreProcess(target?: ConfigTarget) {
    try {
      await this.launch(target)
    } catch (error) {
      this.pushLog('error', `Unable to restore previous profile: ${this.errorMessage(error)}`)
    }
  }

  private processTarget(target: ConfigTarget) {
    return { path: target.path, homeDirectory: target.homeDirectory, name: target.name }
  }

  private async launch(target?: ConfigTarget, signal?: AbortSignal) {
    if (this.settings.tun) await this.desktop.requireTunPermission()
    await this.process.start(signal, target ? this.processTarget(target) : undefined)
    try {
      await this.process.client.updateSettings(this.settings, signal)
      if (this.settings.systemProxy) {
        const source = await this.process.client.snapshot(signal)
        await this.desktop.enableSystemProxy(this.mixedPort(source.configs))
        this.invalidateDesktopStatus()
      }
    } catch (error) {
      await this.desktop.disableSystemProxy().catch(() => {})
      await this.process.stop()
      throw error
    }
  }

  private async updateSettings(next: Partial<RelaySettings>, signal?: AbortSignal) {
    const previous = { ...this.settings }
    if (next.tun === true) await this.desktop.requireTunPermission()
    try {
      if (this.process.running) await this.process.client.updateSettings(next, signal)
      if (next.launchAtLogin !== undefined && next.launchAtLogin !== previous.launchAtLogin) {
        await this.desktop.setLaunchAtLogin(next.launchAtLogin)
      }
      if (next.systemProxy !== undefined && next.systemProxy !== previous.systemProxy) {
        if (next.systemProxy) {
          if (!this.process.running) throw new Error('Start Mihomo before enabling the system proxy')
          const source = await this.process.client.snapshot(signal)
          await this.desktop.enableSystemProxy(this.mixedPort(source.configs))
        } else {
          await this.desktop.disableSystemProxy()
        }
      }
      this.settings = this.settingsStore.update(next)
      this.invalidateDesktopStatus()
    } catch (error) {
      if (this.process.running) await this.process.client.updateSettings(previous).catch(() => {})
      if (next.launchAtLogin !== undefined && next.launchAtLogin !== previous.launchAtLogin) {
        await this.desktop.setLaunchAtLogin(previous.launchAtLogin).catch(() => {})
      }
      if (next.systemProxy !== undefined && next.systemProxy !== previous.systemProxy) {
        if (previous.systemProxy && this.process.running) {
          const source = await this.process.client.snapshot().catch(() => undefined)
          if (source) await this.desktop.enableSystemProxy(this.mixedPort(source.configs)).catch(() => {})
        } else {
          await this.desktop.disableSystemProxy().catch(() => {})
        }
      }
      this.invalidateDesktopStatus()
      throw error
    }
  }

  private mixedPort(configs: Record<string, unknown>) {
    const candidates = [configs['mixed-port'], configs.port, configs['socks-port']]
    const port = candidates.find((value) => typeof value === 'number' && value > 0)
    if (typeof port !== 'number') throw new Error('The active profile does not expose a proxy port')
    return port
  }

  private async initializeDesktop() {
    if (this.desktopInitialized) return
    const recovered = await this.desktop.initialize()
    this.desktopInitialized = true
    if (recovered) this.pushLog('warning', 'Recovered system proxy settings from an interrupted Relay session')
    if (this.settings.launchAtLogin) {
      try {
        await this.desktop.setLaunchAtLogin(true)
      } catch (error) {
        this.pushLog('warning', `Unable to synchronize launch at login: ${this.errorMessage(error)}`)
      }
    }
    this.invalidateDesktopStatus()
  }

  private async getDesktopStatus() {
    if (this.desktopStatus && Date.now() - this.desktopStatusAt < 10_000) return this.desktopStatus
    this.desktopStatus = await this.desktop.status()
    this.desktopStatusAt = Date.now()
    return this.desktopStatus
  }

  private invalidateDesktopStatus() {
    this.desktopStatus = undefined
    this.desktopStatusAt = 0
  }

  private async handleUnexpectedCoreExit() {
    try {
      await this.desktop.disableSystemProxy()
      this.invalidateDesktopStatus()
      this.pushLog('warning', 'System proxy restored after Mihomo exited unexpectedly')
    } catch (error) {
      this.pushLog('error', `Unable to restore system proxy after Mihomo exit: ${this.errorMessage(error)}`)
    }
  }

  private profileList(runtimeProxies = 0, runtimeRules = 0): Profile[] {
    const stored = this.profiles.list()
    const hasManagedActive = stored.some((profile) => profile.active)
    return [{
      id: 'runtime',
      name: this.runtimeProfileName,
      source: 'local',
      active: !hasManagedActive,
      updatedAt: this.runtimeProfileUpdatedAt,
      proxies: hasManagedActive ? 0 : runtimeProxies,
      rules: hasManagedActive ? 0 : runtimeRules,
      revision: 1,
      canUpdate: false,
      canRollback: false,
    }, ...stored.map((profile) => hasManagedActive && profile.active ? {
      ...profile,
      proxies: runtimeProxies || profile.proxies,
      rules: runtimeRules || profile.rules,
    } : profile)]
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }

  private pushLog(level: LogEntry['level'], message: string) {
    this.fileLogger.write(level, message)
    this.logs = [...this.logs, {
      id: `log-${Date.now()}-${this.logs.length}`,
      level,
      time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      message,
    }].slice(-200)
  }
}
