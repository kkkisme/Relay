import type { RelaySettings } from '../core/types'

export type MihomoProxy = {
  name: string
  type: string
  now?: string
  all?: string[]
  history?: Array<{ time: string; delay: number }>
}

export type MihomoConnection = {
  id: string
  metadata?: {
    host?: string
    destinationIP?: string
    destinationPort?: string | number
    process?: string
    processPath?: string
  }
  upload?: number
  download?: number
  rule?: string
  chains?: string[]
  start?: string
}

export type MihomoSnapshot = {
  version: { version?: string }
  configs: Record<string, unknown>
  proxies: { proxies?: Record<string, MihomoProxy> }
  connections: {
    downloadTotal?: number
    uploadTotal?: number
    memory?: number
    connections?: MihomoConnection[]
  }
  rules: { rules?: unknown[] }
}

export class MihomoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  snapshot(signal?: AbortSignal): Promise<MihomoSnapshot> {
    return Promise.all([
      this.request<{ version?: string }>('/version', {}, signal),
      this.request<Record<string, unknown>>('/configs', {}, signal),
      this.request<{ proxies?: Record<string, MihomoProxy> }>('/proxies', {}, signal),
      this.request<MihomoSnapshot['connections']>('/connections', {}, signal),
      this.request<{ rules?: unknown[] }>('/rules', {}, signal),
    ]).then(([version, configs, proxies, connections, rules]) => ({
      version,
      configs,
      proxies,
      connections,
      rules,
    }))
  }

  async selectProxy(group: string, proxy: string, signal?: AbortSignal) {
    await this.request(`/proxies/${encodeURIComponent(group)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: proxy }),
    }, signal)
  }

  testGroup(group: string, signal?: AbortSignal) {
    const query = new URLSearchParams({
      url: 'https://www.gstatic.com/generate_204',
      timeout: '5000',
    })
    return this.request<Record<string, number>>(
      `/group/${encodeURIComponent(group)}/delay?${query}`,
      {},
      signal,
    )
  }

  async closeConnection(id: string, signal?: AbortSignal) {
    await this.request(`/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }, signal)
  }

  async closeAllConnections(signal?: AbortSignal) {
    await this.request('/connections', { method: 'DELETE' }, signal)
  }

  async updateSettings(settings: Partial<RelaySettings>, signal?: AbortSignal) {
    const patch: Record<string, unknown> = {}
    if (settings.mode !== undefined) patch.mode = settings.mode
    if (settings.allowLan !== undefined) patch['allow-lan'] = settings.allowLan
    if (settings.ipv6 !== undefined) patch.ipv6 = settings.ipv6
    if (settings.tun !== undefined) patch.tun = { enable: settings.tun }
    if (Object.keys(patch).length === 0) return

    await this.request('/configs?force=true', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }, signal)
  }

  private async request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('Mihomo API request timed out')), 7000)
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      })
      if (!response.ok) {
        const detail = (await response.text()).trim()
        throw new Error(`Mihomo API ${response.status}: ${detail || response.statusText}`)
      }
      if (response.status === 204) return undefined as T
      const text = await response.text()
      return (text ? JSON.parse(text) : undefined) as T
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }
}
