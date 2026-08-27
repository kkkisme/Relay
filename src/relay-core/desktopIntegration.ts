import process from 'node:process'
import type { DesktopStatus } from '../core/types'
import { LaunchAtLoginManager } from './launchAtLogin'
import { PrivilegedHelperManager } from './privilegedHelper'
import { SystemProxyManager } from './systemProxy'
import { TunPermissionInspector } from './tunPermissions'

export class DesktopIntegration {
  constructor(
    private readonly systemProxy = new SystemProxyManager(),
    private readonly launchAtLogin = new LaunchAtLoginManager(),
    private readonly tun = new TunPermissionInspector(),
    readonly helper = new PrivilegedHelperManager(),
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
    const status = await this.tunStatus()
    if (status.permission !== 'granted') throw new Error(status.detail)
  }

  installTunHelper(mihomoBinary: string) {
    return this.helper.install(mihomoBinary)
  }

  uninstallTunHelper() {
    return this.helper.uninstall()
  }

  async useTunHelper() {
    const [native, helper] = await Promise.all([this.tun.inspect(), this.helper.state()])
    return native.permission !== 'granted' && helper.state === 'ready'
  }

  async status(): Promise<DesktopStatus> {
    const [systemProxy, tun, launchAtLogin] = await Promise.all([
      this.systemProxy.status(),
      this.tunStatus(),
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

  private async tunStatus(): Promise<DesktopStatus['tun']> {
    const [native, helper] = await Promise.all([this.tun.inspect(), this.helper.state()])
    if (helper.state === 'ready' && native.supported) {
      return {
        ...native,
        supported: true,
        permission: 'granted',
        detail: helper.detail,
        helper: helper.state,
        installSupported: helper.installSupported,
      }
    }
    return {
      ...native,
      helper: helper.state,
      installSupported: helper.installSupported,
      detail: helper.state === 'unavailable' && native.permission !== 'granted' ? helper.detail : native.detail,
    }
  }
}
