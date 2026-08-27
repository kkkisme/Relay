import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import type { CommandRunner } from './systemProxy'
import { runCommand } from './systemProxy'

function xml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function desktopArgument(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`
}

export class LaunchAtLoginManager {
  private readonly platform: NodeJS.Platform
  private readonly home: string
  private readonly appBinary: string
  private readonly run: CommandRunner
  private readonly environment: NodeJS.ProcessEnv

  constructor(options: {
    platform?: NodeJS.Platform
    home?: string
    appBinary?: string
    runner?: CommandRunner
    environment?: NodeJS.ProcessEnv
  } = {}) {
    this.platform = options.platform ?? process.platform
    this.home = options.home ?? homedir()
    this.appBinary = options.appBinary ?? process.env.RELAY_APP_BINARY ?? ''
    this.run = options.runner ?? runCommand
    this.environment = options.environment ?? process.env
  }

  get supported() {
    return Boolean(this.appBinary) && ['win32', 'darwin', 'linux'].includes(this.platform)
  }

  async enabled() {
    if (!this.supported) return false
    if (this.platform === 'win32') {
      try {
        await this.run('reg.exe', ['QUERY', String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, '/v', 'Relay'])
        return true
      } catch {
        return false
      }
    }
    return existsSync(this.filePath())
  }

  async setEnabled(enabled: boolean) {
    if (!this.supported) throw new Error('Launch at login is unsupported in this build')
    if (this.platform === 'win32') {
      const key = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
      if (enabled) {
        await this.run('reg.exe', ['ADD', key, '/v', 'Relay', '/t', 'REG_SZ', '/d', `"${this.appBinary}"`, '/f'])
      } else {
        await this.run('reg.exe', ['DELETE', key, '/v', 'Relay', '/f']).catch(() => {})
      }
      return
    }

    const path = this.filePath()
    if (!enabled) {
      rmSync(path, { force: true })
      return
    }
    mkdirSync(dirname(path), { recursive: true })
    if (this.platform === 'darwin') {
      writeFileSync(path, [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0"><dict>',
        '<key>Label</key><string>app.relay.client</string>',
        `<key>ProgramArguments</key><array><string>${xml(this.appBinary)}</string></array>`,
        '<key>RunAtLoad</key><true/>',
        '</dict></plist>',
        '',
      ].join('\n'), { mode: 0o600 })
      return
    }
    writeFileSync(path, [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Relay',
      `Exec=${desktopArgument(this.appBinary)}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      '',
    ].join('\n'), { mode: 0o600 })
  }

  private filePath() {
    if (this.platform === 'darwin') return join(this.home, 'Library', 'LaunchAgents', 'app.relay.client.plist')
    return join(this.environment.XDG_CONFIG_HOME ?? join(this.home, '.config'), 'autostart', 'relay.desktop')
  }
}
