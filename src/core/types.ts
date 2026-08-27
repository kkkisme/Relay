export type ProxyMode = 'rule' | 'global' | 'direct'
export type LogLevel = 'debug' | 'info' | 'warning' | 'error'

export type ProxyNode = {
  id: string
  name: string
  type: 'ss' | 'vmess' | 'trojan' | 'hysteria2'
  location: string
  latency: number | null
}

export type ProxyGroup = {
  id: string
  name: string
  kind: 'select' | 'url-test' | 'fallback'
  selectedNodeId: string
  nodes: ProxyNode[]
}

export type Profile = {
  id: string
  name: string
  source: string
  active: boolean
  updatedAt: string
  proxies: number
  rules: number
}

export type Connection = {
  id: string
  host: string
  process: string
  upload: number
  download: number
  rule: string
  chain: string
  duration: string
}

export type LogEntry = {
  id: string
  level: LogLevel
  time: string
  message: string
}

export type RelaySettings = {
  systemProxy: boolean
  tun: boolean
  allowLan: boolean
  ipv6: boolean
  mode: ProxyMode
}

export type TrafficMetrics = {
  uploadSpeed: number
  downloadSpeed: number
  uploadTotal: number
  downloadTotal: number
  memory: number
  connections: number
}

export type CoreStatus = {
  running: boolean
  version: string
  uptime: string
}

export type RelaySnapshot = {
  status: CoreStatus
  metrics: TrafficMetrics
  proxyGroups: ProxyGroup[]
  profiles: Profile[]
  connections: Connection[]
  logs: LogEntry[]
  settings: RelaySettings
}

export type CoreMethodMap = {
  'core.snapshot': { arguments: undefined; result: RelaySnapshot }
  'core.set-running': { arguments: { running: boolean }; result: RelaySnapshot }
  'proxy.select': { arguments: { groupId: string; nodeId: string }; result: RelaySnapshot }
  'proxy.test': { arguments: { groupId: string }; result: RelaySnapshot }
  'profile.activate': { arguments: { profileId: string }; result: RelaySnapshot }
  'connection.close': { arguments: { connectionId: string }; result: RelaySnapshot }
  'connection.close-all': { arguments: undefined; result: RelaySnapshot }
  'settings.update': { arguments: Partial<RelaySettings>; result: RelaySnapshot }
  'logs.clear': { arguments: undefined; result: RelaySnapshot }
}

export type CoreMethod = keyof CoreMethodMap

export type CoreRequest<K extends CoreMethod = CoreMethod> = {
  id: number
  method: K
  arguments: CoreMethodMap[K]['arguments']
}

export type CoreResponse<T = unknown> = {
  id: number
  result?: T
  error?: string
}

export type CoreEvent = {
  type: 'snapshot.updated'
  data: RelaySnapshot
}
