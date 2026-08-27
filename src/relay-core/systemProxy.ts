import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'
import { relayPaths } from './platformPaths'

export type CommandRunner = (file: string, argumentsValue: string[]) => Promise<string>
export type SystemProxyAdapter = {
  platform: string
  capture(): Promise<unknown>
  apply(port: number): Promise<void>
  restore(state: unknown): Promise<void>
  enabled(): Promise<boolean>
}

type RecoveryDocument = {
  version: 1
  platform: string
  port: number
  capturedAt: string
  state: unknown
}

export const runCommand: CommandRunner = (file, argumentsValue) =>
  new Promise((resolve, reject) => {
    execFile(file, argumentsValue, {
      timeout: 12_000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${file} failed: ${(stderr || error.message).trim()}`))
        return
      }
      resolve(stdout.trim())
    })
  })

export class SystemProxyManager {
  constructor(
    private readonly adapter = createSystemProxyAdapter(),
    private readonly recoveryPath = relayPaths().recovery,
  ) {}

  get supported() {
    return Boolean(this.adapter)
  }

  get managed() {
    return existsSync(this.recoveryPath)
  }

  async recoverStale() {
    if (!this.adapter || !existsSync(this.recoveryPath)) return false
    const document = this.readRecovery()
    if (document.platform !== this.adapter.platform) {
      throw new Error(`System proxy recovery belongs to ${document.platform}, not ${this.adapter.platform}`)
    }
    await this.adapter.restore(document.state)
    rmSync(this.recoveryPath, { force: true })
    return true
  }

  async enable(port: number) {
    if (!this.adapter) throw new Error('System proxy is unsupported on this platform')
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Mihomo mixed port is invalid')
    if (existsSync(this.recoveryPath)) await this.recoverStale()
    const state = await this.adapter.capture()
    this.writeRecovery({
      version: 1,
      platform: this.adapter.platform,
      port,
      capturedAt: new Date().toISOString(),
      state,
    })
    try {
      await this.adapter.apply(port)
    } catch (error) {
      await this.adapter.restore(state).catch(() => {})
      rmSync(this.recoveryPath, { force: true })
      throw error
    }
  }

  async disable() {
    if (!this.adapter || !existsSync(this.recoveryPath)) return
    const document = this.readRecovery()
    await this.adapter.restore(document.state)
    rmSync(this.recoveryPath, { force: true })
  }

  async status() {
    if (!this.adapter) return { supported: false, enabled: false, managed: false }
    try {
      return {
        supported: true,
        enabled: await this.adapter.enabled(),
        managed: this.managed,
      }
    } catch (error) {
      return {
        supported: false,
        enabled: false,
        managed: this.managed,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private readRecovery() {
    try {
      const document = JSON.parse(readFileSync(this.recoveryPath, 'utf8')) as RecoveryDocument
      if (document.version !== 1 || !document.platform || !('state' in document)) {
        throw new Error('Unsupported recovery document')
      }
      return document
    } catch (error) {
      throw new Error(`Unable to restore system proxy: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private writeRecovery(document: RecoveryDocument) {
    const directory = dirname(this.recoveryPath)
    mkdirSync(directory, { recursive: true })
    const temporaryPath = `${this.recoveryPath}.${randomUUID()}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporaryPath, this.recoveryPath)
  }
}

export function createSystemProxyAdapter(
  platform = process.platform,
  runner: CommandRunner = runCommand,
): SystemProxyAdapter | undefined {
  if (platform === 'win32') return windowsAdapter(runner)
  if (platform === 'darwin') return macAdapter(runner)
  if (platform === 'linux') return gnomeAdapter(runner)
  return undefined
}

function windowsAdapter(run: CommandRunner): SystemProxyAdapter {
  const key = String.raw`HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings`
  const captureScript = `$p=Get-ItemProperty '${key}'; @{ProxyEnable=[int]$p.ProxyEnable;ProxyServer=[string]$p.ProxyServer;ProxyOverride=[string]$p.ProxyOverride}|ConvertTo-Json -Compress`
  const notifyScript = 'rundll32.exe user32.dll,UpdatePerUserSystemParameters'
  return {
    platform: 'win32',
    capture: async () => JSON.parse(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', captureScript])),
    apply: async (port) => {
      const script = `Set-ItemProperty '${key}' ProxyEnable 1; Set-ItemProperty '${key}' ProxyServer '127.0.0.1:${port}'; Set-ItemProperty '${key}' ProxyOverride '<local>'; ${notifyScript}`
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    },
    restore: async (state) => {
      const encoded = Buffer.from(JSON.stringify(state)).toString('base64')
      const script = `$s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($args[0]))|ConvertFrom-Json; Set-ItemProperty '${key}' ProxyEnable ([int]$s.ProxyEnable); Set-ItemProperty '${key}' ProxyServer ([string]$s.ProxyServer); Set-ItemProperty '${key}' ProxyOverride ([string]$s.ProxyOverride); ${notifyScript}`
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, encoded])
    },
    enabled: async () => {
      const value = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-ItemProperty '${key}').ProxyEnable`])
      return value.trim() === '1'
    },
  }
}

type MacProxy = { enabled: boolean; server: string; port: number }
type MacState = { services: Array<{ name: string; web: MacProxy; secure: MacProxy }> }

function macAdapter(run: CommandRunner): SystemProxyAdapter {
  const readProxy = async (service: string, secure: boolean): Promise<MacProxy> => {
    const output = await run('/usr/sbin/networksetup', [secure ? '-getsecurewebproxy' : '-getwebproxy', service])
    const values = Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
      const index = line.indexOf(':')
      return index < 0 ? [] : [[line.slice(0, index).trim(), line.slice(index + 1).trim()]]
    }))
    return { enabled: values.Enabled === 'Yes', server: values.Server ?? '', port: Number(values.Port) || 0 }
  }
  const services = async () => (await run('/usr/sbin/networksetup', ['-listallnetworkservices']))
    .split(/\r?\n/).slice(1).map((item) => item.trim()).filter((item) => item && !item.startsWith('*'))
  const setProxy = async (name: string, secure: boolean, proxy: MacProxy) => {
    const prefix = secure ? '-setsecurewebproxy' : '-setwebproxy'
    if (proxy.server && proxy.port) await run('/usr/sbin/networksetup', [prefix, name, proxy.server, String(proxy.port)])
    await run('/usr/sbin/networksetup', [secure ? '-setsecurewebproxystate' : '-setwebproxystate', name, proxy.enabled ? 'on' : 'off'])
  }
  return {
    platform: 'darwin',
    capture: async (): Promise<MacState> => ({
      services: await Promise.all((await services()).map(async (name) => ({
        name,
        web: await readProxy(name, false),
        secure: await readProxy(name, true),
      }))),
    }),
    apply: async (port) => {
      for (const name of await services()) {
        await setProxy(name, false, { enabled: true, server: '127.0.0.1', port })
        await setProxy(name, true, { enabled: true, server: '127.0.0.1', port })
      }
    },
    restore: async (state) => {
      for (const service of (state as MacState).services) {
        await setProxy(service.name, false, service.web)
        await setProxy(service.name, true, service.secure)
      }
    },
    enabled: async () => {
      const names = await services()
      return names.length > 0 && (await Promise.all(names.map((name) => readProxy(name, false)))).some((proxy) => proxy.enabled)
    },
  }
}

type GnomeState = { mode: string; httpHost: string; httpPort: string; httpsHost: string; httpsPort: string }

function gnomeAdapter(run: CommandRunner): SystemProxyAdapter {
  const get = (schema: string, key: string) => run('gsettings', ['get', schema, key])
  const set = (schema: string, key: string, value: string) => run('gsettings', ['set', schema, key, value])
  const unquote = (value: string) => value.replace(/^['"]|['"]$/g, '')
  const capture = async (): Promise<GnomeState> => ({
    mode: await get('org.gnome.system.proxy', 'mode'),
    httpHost: await get('org.gnome.system.proxy.http', 'host'),
    httpPort: await get('org.gnome.system.proxy.http', 'port'),
    httpsHost: await get('org.gnome.system.proxy.https', 'host'),
    httpsPort: await get('org.gnome.system.proxy.https', 'port'),
  })
  return {
    platform: 'linux',
    capture,
    apply: async (port) => {
      await set('org.gnome.system.proxy.http', 'host', "'127.0.0.1'")
      await set('org.gnome.system.proxy.http', 'port', String(port))
      await set('org.gnome.system.proxy.https', 'host', "'127.0.0.1'")
      await set('org.gnome.system.proxy.https', 'port', String(port))
      await set('org.gnome.system.proxy', 'mode', "'manual'")
    },
    restore: async (state) => {
      const saved = state as GnomeState
      await set('org.gnome.system.proxy.http', 'host', saved.httpHost)
      await set('org.gnome.system.proxy.http', 'port', saved.httpPort)
      await set('org.gnome.system.proxy.https', 'host', saved.httpsHost)
      await set('org.gnome.system.proxy.https', 'port', saved.httpsPort)
      await set('org.gnome.system.proxy', 'mode', saved.mode)
    },
    enabled: async () => unquote(await get('org.gnome.system.proxy', 'mode')) === 'manual',
  }
}
