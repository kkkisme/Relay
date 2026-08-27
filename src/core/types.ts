export type ProxyMode = 'rule' | 'global' | 'direct'
export type LogLevel = 'debug' | 'info' | 'warning' | 'error'

export type ProxyNode = {
  id: string
  name: string
  type: string
  location: string
  latency: number | null
  error?: string
}

export type ProxyGroup = {
  id: string
  name: string
  kind: string
  selectedNodeId: string
  nodes: ProxyNode[]
}

export type Profile = {
  id: string
  name: string
  source: 'remote' | 'local'
  active: boolean
  updatedAt: string
  proxies: number
  rules: number
  revision: number
  canUpdate: boolean
  canRollback: boolean
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
  launchAtLogin: boolean
}

export type DesktopStatus = {
  platform: string
  systemProxy: {
    supported: boolean
    enabled: boolean
    managed: boolean
    error?: string
  }
  tun: {
    supported: boolean
    permission: 'granted' | 'required' | 'unavailable'
    detail: string
    helper: 'ready' | 'not-installed' | 'unavailable'
    installSupported: boolean
  }
  launchAtLogin: {
    supported: boolean
    enabled: boolean
  }
  tray: {
    supported: boolean
    detail: string
  }
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
  desktop: DesktopStatus
}

export type CoreMethodMap = {
  'core.snapshot': { arguments: undefined; result: RelaySnapshot }
  'core.set-running': { arguments: { running: boolean }; result: RelaySnapshot }
  'proxy.select': { arguments: { groupId: string; nodeId: string }; result: RelaySnapshot }
  'proxy.test': { arguments: { groupId: string }; result: RelaySnapshot }
  'profile.activate': { arguments: { profileId: string }; result: RelaySnapshot }
  'profile.import': {
    arguments: { name: string; source: 'remote' | 'local'; location: string }
    result: RelaySnapshot
  }
  'profile.update': { arguments: { profileId: string }; result: RelaySnapshot }
  'profile.rollback': { arguments: { profileId: string }; result: RelaySnapshot }
  'connection.close': { arguments: { connectionId: string }; result: RelaySnapshot }
  'connection.close-all': { arguments: undefined; result: RelaySnapshot }
  'settings.update': { arguments: Partial<RelaySettings>; result: RelaySnapshot }
  'tun.install-helper': { arguments: undefined; result: RelaySnapshot }
  'tun.uninstall-helper': { arguments: undefined; result: RelaySnapshot }
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
