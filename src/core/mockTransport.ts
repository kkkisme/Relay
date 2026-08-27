import type { CoreEventListener, CoreTransport } from './transport'
import type {
  CoreMethod,
  CoreMethodMap,
  CoreRequest,
  CoreResponse,
  LogEntry,
  RelaySnapshot,
} from './types'

const now = () => new Date().toLocaleTimeString('en-GB', { hour12: false })

const initialSnapshot: RelaySnapshot = {
  status: { running: true, version: 'Mihomo 1.19.12', uptime: '02:18:46' },
  metrics: {
    uploadSpeed: 128,
    downloadSpeed: 2840,
    uploadTotal: 2.7,
    downloadTotal: 18.4,
    memory: 86,
    connections: 4,
  },
  proxyGroups: [
    {
      id: 'global',
      name: 'Global Proxy',
      kind: 'select',
      selectedNodeId: 'hk-01',
      nodes: [
        { id: 'hk-01', name: 'Hong Kong 01', type: 'hysteria2', location: 'HK', latency: 42 },
        { id: 'tw-01', name: 'Taiwan 01', type: 'trojan', location: 'TW', latency: 58 },
        { id: 'jp-01', name: 'Tokyo 01', type: 'vmess', location: 'JP', latency: 76 },
        { id: 'sg-01', name: 'Singapore 01', type: 'ss', location: 'SG', latency: 112 },
      ],
    },
    {
      id: 'streaming',
      name: 'Streaming',
      kind: 'url-test',
      selectedNodeId: 'tw-01',
      nodes: [
        { id: 'tw-01', name: 'Taiwan 01', type: 'trojan', location: 'TW', latency: 58 },
        { id: 'jp-01', name: 'Tokyo 01', type: 'vmess', location: 'JP', latency: 76 },
        { id: 'us-01', name: 'Los Angeles 01', type: 'hysteria2', location: 'US', latency: 168 },
      ],
    },
  ],
  profiles: [
    {
      id: 'primary',
      name: 'Primary Subscription',
      source: 'Remote subscription',
      active: true,
      updatedAt: '5 minutes ago',
      proxies: 42,
      rules: 11834,
    },
    {
      id: 'office',
      name: 'Office Rules',
      source: 'Local profile',
      active: false,
      updatedAt: 'Yesterday',
      proxies: 8,
      rules: 294,
    },
  ],
  connections: [
    { id: 'c1', host: 'api.github.com:443', process: 'zed.exe', upload: 18, download: 312, rule: 'GitHub', chain: 'Hong Kong 01', duration: '04:12' },
    { id: 'c2', host: 'chatgpt.com:443', process: 'chrome.exe', upload: 42, download: 1840, rule: 'OpenAI', chain: 'Taiwan 01', duration: '02:48' },
    { id: 'c3', host: 'music.163.com:443', process: 'cloudmusic.exe', upload: 6, download: 488, rule: 'CN Direct', chain: 'DIRECT', duration: '11:06' },
    { id: 'c4', host: 'registry.npmjs.org:443', process: 'bun.exe', upload: 62, download: 720, rule: 'Developer', chain: 'Hong Kong 01', duration: '00:36' },
  ],
  logs: [
    { id: 'l1', level: 'info', time: '14:06:18', message: 'Mihomo core started successfully' },
    { id: 'l2', level: 'info', time: '14:06:19', message: 'Loaded 11,834 rules from Primary Subscription' },
    { id: 'l3', level: 'debug', time: '14:08:42', message: 'chatgpt.com matched rule OpenAI -> Taiwan 01' },
    { id: 'l4', level: 'warning', time: '14:09:03', message: 'Tokyo 01 latency increased to 186 ms' },
  ],
  settings: { systemProxy: true, tun: false, allowLan: false, ipv6: false, mode: 'rule' },
}

const clone = <T,>(value: T): T => structuredClone(value)

export class MockCoreTransport implements CoreTransport {
  private snapshot = clone(initialSnapshot)
  private listeners = new Set<CoreEventListener>()
  private ticker: ReturnType<typeof setInterval> | undefined

  async connect() {
    if (this.ticker) return
    this.ticker = setInterval(() => {
      if (!this.snapshot.status.running) return
      const delta = Math.round(Math.random() * 420 - 160)
      this.snapshot.metrics.downloadSpeed = Math.max(120, this.snapshot.metrics.downloadSpeed + delta)
      this.snapshot.metrics.uploadSpeed = Math.max(12, this.snapshot.metrics.uploadSpeed + Math.round(delta / 8))
      this.emit()
    }, 2400)
  }

  async disconnect() {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = undefined
  }

  subscribe(listener: CoreEventListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async request<K extends CoreMethod>(
    request: CoreRequest<K>,
  ): Promise<CoreResponse<CoreMethodMap[K]['result']>> {
    await new Promise((resolve) => setTimeout(resolve, 80))
    try {
      this.apply(request as CoreRequest)
      return { id: request.id, result: clone(this.snapshot) as CoreMethodMap[K]['result'] }
    } catch (error) {
      return { id: request.id, error: error instanceof Error ? error.message : 'Unknown core error' }
    }
  }

  private apply(request: CoreRequest) {
    switch (request.method) {
      case 'core.snapshot':
        return
      case 'core.set-running': {
        const { running } = request.arguments as CoreMethodMap['core.set-running']['arguments']
        this.snapshot.status.running = running
        this.pushLog('info', `Mihomo core ${running ? 'started' : 'stopped'}`)
        break
      }
      case 'proxy.select': {
        const { groupId, nodeId } = request.arguments as CoreMethodMap['proxy.select']['arguments']
        const group = this.snapshot.proxyGroups.find((item) => item.id === groupId)
        if (!group || !group.nodes.some((node) => node.id === nodeId)) throw new Error('Proxy node not found')
        group.selectedNodeId = nodeId
        const node = group.nodes.find((item) => item.id === nodeId)
        this.pushLog('info', `${group.name} switched to ${node?.name}`)
        break
      }
      case 'proxy.test': {
        const { groupId } = request.arguments as CoreMethodMap['proxy.test']['arguments']
        const group = this.snapshot.proxyGroups.find((item) => item.id === groupId)
        if (!group) throw new Error('Proxy group not found')
        group.nodes.forEach((node, index) => {
          node.latency = 36 + index * 29 + Math.round(Math.random() * 32)
        })
        this.pushLog('debug', `Completed latency test for ${group.name}`)
        break
      }
      case 'profile.activate': {
        const { profileId } = request.arguments as CoreMethodMap['profile.activate']['arguments']
        if (!this.snapshot.profiles.some((profile) => profile.id === profileId)) throw new Error('Profile not found')
        this.snapshot.profiles.forEach((profile) => {
          profile.active = profile.id === profileId
        })
        this.pushLog('info', 'Profile activated and configuration reloaded')
        break
      }
      case 'connection.close': {
        const { connectionId } = request.arguments as CoreMethodMap['connection.close']['arguments']
        this.snapshot.connections = this.snapshot.connections.filter((item) => item.id !== connectionId)
        this.snapshot.metrics.connections = this.snapshot.connections.length
        break
      }
      case 'connection.close-all':
        this.snapshot.connections = []
        this.snapshot.metrics.connections = 0
        this.pushLog('info', 'Closed all active connections')
        break
      case 'settings.update':
        this.snapshot.settings = { ...this.snapshot.settings, ...request.arguments }
        this.pushLog('info', 'Runtime settings updated')
        break
      case 'logs.clear':
        this.snapshot.logs = []
        break
      default:
        throw new Error(`Unsupported core method: ${request.method}`)
    }
    this.emit()
  }

  private pushLog(level: LogEntry['level'], message: string) {
    this.snapshot.logs = [
      ...this.snapshot.logs,
      { id: `log-${Date.now()}`, level, time: now(), message },
    ].slice(-100)
  }

  private emit() {
    const event = { type: 'snapshot.updated' as const, data: clone(this.snapshot) }
    this.listeners.forEach((listener) => listener(event))
  }
}
