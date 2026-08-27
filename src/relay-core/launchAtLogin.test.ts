import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LaunchAtLoginManager } from './launchAtLogin'

describe('LaunchAtLoginManager', () => {
  const directories: string[] = []

  afterEach(() => {
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  })

  function home() {
    const path = mkdtempSync(join(tmpdir(), 'relay-login-test-'))
    directories.push(path)
    return path
  }

  test('writes and removes a macOS LaunchAgent', async () => {
    const directory = home()
    const manager = new LaunchAtLoginManager({
      platform: 'darwin',
      home: directory,
      appBinary: '/Applications/Relay & Tools/Relay',
    })
    const path = join(directory, 'Library', 'LaunchAgents', 'app.relay.client.plist')

    await manager.setEnabled(true)
    expect(await manager.enabled()).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('/Applications/Relay &amp; Tools/Relay')

    await manager.setEnabled(false)
    expect(existsSync(path)).toBe(false)
  })

  test('writes an XDG autostart entry with a safely quoted executable', async () => {
    const directory = home()
    const config = join(directory, 'xdg-config')
    const manager = new LaunchAtLoginManager({
      platform: 'linux',
      home: directory,
      appBinary: '/opt/Relay Client/relay',
      environment: { XDG_CONFIG_HOME: config },
    })

    await manager.setEnabled(true)

    expect(readFileSync(join(config, 'autostart', 'relay.desktop'), 'utf8'))
      .toContain('Exec="/opt/Relay Client/relay"')
  })

  test('uses the current-user Run key on Windows', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    const runner = async (file: string, args: string[]) => {
      calls.push({ file, args })
      return ''
    }
    const manager = new LaunchAtLoginManager({
      platform: 'win32',
      appBinary: 'C:\\Program Files\\Relay\\relay.exe',
      runner,
    })

    await manager.setEnabled(true)
    expect(await manager.enabled()).toBe(true)
    expect(calls[0]).toEqual(expect.objectContaining({ file: 'reg.exe' }))
    expect(calls[0]?.args).toContain(String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`)
    expect(calls[0]?.args).toContain('"C:\\Program Files\\Relay\\relay.exe"')
  })

  test('is unsupported when the packaged app path is unavailable', async () => {
    const manager = new LaunchAtLoginManager({ platform: 'linux', appBinary: '' })
    expect(manager.supported).toBe(false)
    expect(await manager.enabled()).toBe(false)
    await expect(manager.setEnabled(true)).rejects.toThrow('unsupported')
  })
})
