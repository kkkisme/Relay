import process from 'node:process'
import type { DesktopStatus } from '../core/types'
import { LaunchAtLoginManager } from './launchAtLogin'
import { SystemProxyManager } from './systemProxy'
import { TunPermissionInspector } from './tunPermissions'

export class DesktopIntegration {
  constructor(
    private readonly systemProxy = new SystemProxyManager(),
    private readonly launchAtLogin = new LaunchAtLoginManager(),
    private readonly tun = new TunPermissionInspector(),
  ) {}

  async initialize() {
    return this.systemProxy.recoverStale()
  }

  enableSystemProxy(port: number) {
    return this.systemProxy.enable(port)
  }

  disableSystemProxy() {
    return this.systemProxy.disable()
  }

  setLaunchAtLogin(enabled: boolean) {
    return this.launchAtLogin.setEnabled(enabled)
  }

  async requireTunPermission() {
    const status = await this.tun.inspect()
    if (status.permission !== 'granted') throw new Error(status.detail)
  }

  async status(): Promise<DesktopStatus> {
    const [systemProxy, tun, launchAtLogin] = await Promise.all([
      this.systemProxy.status(),
      this.tun.inspect(),
      this.launchAtLogin.enabled(),
    ])
    return {
      platform: process.platform,
      systemProxy,
      tun,
      launchAtLogin: {
        supported: this.launchAtLogin.supported,
        enabled: launchAtLogin,
      },
      tray: {
        supported: false,
        detail: 'The current GPUIX release does not expose tray or window hide/show APIs.',
      },
    }
  }
}
