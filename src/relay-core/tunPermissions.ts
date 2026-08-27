import { constants, existsSync, promises as fs } from 'node:fs'
import process from 'node:process'
import type { DesktopStatus } from '../core/types'
import type { CommandRunner } from './systemProxy'
import { runCommand } from './systemProxy'

type TunStatus = Omit<DesktopStatus['tun'], 'helper' | 'installSupported'>

export class TunPermissionInspector {
  constructor(
    private readonly platform = process.platform,
    private readonly run: CommandRunner = runCommand,
    private readonly getuid = process.getuid?.bind(process),
  ) {}

  async inspect(): Promise<TunStatus> {
    if (this.platform === 'win32') return this.windows()
    if (this.platform === 'darwin') {
      const granted = this.getuid?.() === 0
      return {
        supported: true,
        permission: granted ? 'granted' : 'required',
        detail: granted
          ? 'Relay Core is running with permission to create a utun interface.'
          : 'TUN requires a signed privileged helper or an elevated Relay Core.',
      }
    }
    if (this.platform === 'linux') return this.linux()
    return { supported: false, permission: 'unavailable', detail: 'TUN is unsupported on this platform.' }
  }

  private async windows(): Promise<TunStatus> {
    try {
      const script = "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
      const result = await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
      const granted = result.trim().toLowerCase() === 'true'
      return {
        supported: true,
        permission: granted ? 'granted' : 'required',
        detail: granted
          ? 'Relay has administrator permission for the Wintun adapter.'
          : 'TUN requires administrator permission and a packaged Wintun driver.',
      }
    } catch (error) {
      return { supported: false, permission: 'unavailable', detail: error instanceof Error ? error.message : String(error) }
    }
  }

  private async linux(): Promise<TunStatus> {
    if (!existsSync('/dev/net/tun')) {
      return { supported: false, permission: 'unavailable', detail: '/dev/net/tun is unavailable.' }
    }
    try {
      await fs.access('/dev/net/tun', constants.R_OK | constants.W_OK)
      const root = this.getuid?.() === 0
      return {
        supported: true,
        permission: root ? 'granted' : 'required',
        detail: root
          ? 'Relay Core can access /dev/net/tun.'
          : 'Grant CAP_NET_ADMIN to Mihomo or run its privileged service helper.',
      }
    } catch {
      return { supported: true, permission: 'required', detail: 'Relay Core cannot access /dev/net/tun.' }
    }
  }
}
