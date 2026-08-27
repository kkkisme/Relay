import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import type {
  HelperClientConfig,
  HelperConfig,
  HelperRequest,
  HelperResponse,
  HelperStatus,
} from '../relay-helper/protocol'
import { relayPaths } from './platformPaths'

type HelperState = {
  state: 'ready' | 'not-installed' | 'unavailable'
  installSupported: boolean
  detail: string
}

type ElevationRunner = (helperBinary: string, operation: 'install' | 'uninstall', source?: string) => Promise<void>
type HelperOperation =
  | { method: 'status' }
  | { method: 'start'; configPath: string }
  | { method: 'stop' }

const delay = (milliseconds: number) => new Promise<void>((resolveValue) => setTimeout(resolveValue, milliseconds))

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

function appleScript(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function powershell(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function execute(file: string, args: string[]) {
  return new Promise<void>((resolveValue, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 180_000 }, (error) => error ? reject(error) : resolveValue())
  })
}

export class PrivilegedHelperManager {
  private requestId = 0

  constructor(private readonly options: {
    platform?: NodeJS.Platform
    helperBinary?: string
    clientConfigPath?: string
    dataRoot?: string
    elevationRunner?: ElevationRunner
  } = {}) {}

  get platform() {
    return this.options.platform ?? process.platform
  }

  get dataRoot() {
    return resolve(this.options.dataRoot ?? relayPaths().root)
  }

  get clientConfigPath() {
    return this.options.clientConfigPath ?? join(this.dataRoot, 'helper-client.json')
  }

  get helperBinary() {
    if (this.options.helperBinary) return resolve(this.options.helperBinary)
    if (process.env.RELAY_HELPER_BINARY) return resolve(process.env.RELAY_HELPER_BINARY)
    const name = this.platform === 'win32' ? 'relay-helper.exe' : 'relay-helper'
    const candidates = [join(dirname(process.execPath), name), join(process.cwd(), 'dist', name), join(process.cwd(), 'bin', name)]
    return resolve(candidates.find(existsSync) ?? candidates[1])
  }

  get installSupported() {
    return ['win32', 'darwin', 'linux'].includes(this.platform) && existsSync(this.helperBinary)
  }

  async state(): Promise<HelperState> {
    if (!existsSync(this.clientConfigPath)) {
      return {
        state: 'not-installed',
        installSupported: this.installSupported,
        detail: this.installSupported ? 'Relay Helper is not installed.' : 'The packaged Relay Helper binary is unavailable.',
      }
    }
    try {
      const status = await this.status()
      return {
        state: 'ready',
        installSupported: this.installSupported,
        detail: status.running ? 'Relay Helper is managing Mihomo with elevated privileges.' : 'Relay Helper is ready.',
      }
    } catch (error) {
      return {
        state: 'unavailable',
        installSupported: this.installSupported,
        detail: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async install(mihomoBinary: string) {
    if (!this.installSupported) throw new Error('The packaged Relay Helper binary is unavailable')
    if (!existsSync(mihomoBinary)) throw new Error('Mihomo binary is unavailable')
    const expectedName = this.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
    const expectedMihomo = join(dirname(this.helperBinary), expectedName)
    if (resolve(mihomoBinary) !== resolve(expectedMihomo)) {
      throw new Error('TUN requires the packaged Mihomo binary beside Relay Helper')
    }
    const client: HelperClientConfig = {
      version: 1,
      token: randomBytes(32).toString('hex'),
      port: 49_152 + randomBytes(2).readUInt16BE(0) % (65_535 - 49_152),
    }
    const config: HelperConfig = {
      ...client,
      allowedRoot: this.dataRoot,
      runtimeRoot: this.dataRoot,
      mihomoBinary: resolve(mihomoBinary),
      mihomoSha256: sha256(resolve(mihomoBinary)),
      helperBinary: this.helperBinary,
    }
    const source = join(this.dataRoot, `.helper-install-${randomUUID()}.json`)
    const previousClient = existsSync(this.clientConfigPath) ? readFileSync(this.clientConfigPath, 'utf8') : undefined
    this.atomicWrite(this.clientConfigPath, client)
    this.atomicWrite(source, config)
    try {
      await (this.options.elevationRunner ?? elevate)(this.helperBinary, 'install', source)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          await this.status()
          return
        } catch {
          await delay(250)
        }
      }
      throw new Error('Relay Helper did not become ready after installation')
    } catch (error) {
      if (previousClient === undefined) rmSync(this.clientConfigPath, { force: true })
      else this.atomicWriteText(this.clientConfigPath, previousClient)
      throw error
    } finally {
      rmSync(source, { force: true })
    }
  }

  async uninstall() {
    await this.stop().catch(() => {})
    await (this.options.elevationRunner ?? elevate)(this.helperBinary, 'uninstall')
    rmSync(this.clientConfigPath, { force: true })
  }

  status() {
    return this.request({ method: 'status' })
  }

  start(configPath: string) {
    return this.request({ method: 'start', configPath })
  }

  stop() {
    return this.request({ method: 'stop' })
  }

  private request(frame: HelperOperation): Promise<HelperStatus> {
    const config = this.readClientConfig()
    const request = { ...frame, id: ++this.requestId, token: config.token } as HelperRequest
    return new Promise((resolveValue, reject) => {
      const socket = createConnection(config.port, '127.0.0.1')
      let buffer = ''
      let settled = false
      const timeout = setTimeout(() => {
        socket.destroy()
        reject(new Error('Relay Helper request timed out'))
      }, 4_000)
      const finish = (error?: Error, status?: HelperStatus) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        socket.destroy()
        if (error) reject(error)
        else resolveValue(status!)
      }
      socket.setEncoding('utf8')
      socket.once('error', (error) => finish(error))
      socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`))
      socket.on('data', (chunk: string) => {
        buffer += chunk
        const newline = buffer.indexOf('\n')
        if (newline < 0) return
        try {
          const response = JSON.parse(buffer.slice(0, newline)) as HelperResponse
          if (response.id !== request.id) finish(new Error('Relay Helper response ID mismatch'))
          else if (response.error) finish(new Error(response.error))
          else if (!response.result) finish(new Error('Relay Helper returned no status'))
          else if (response.result.version !== 1) finish(new Error('Relay Helper protocol version is incompatible'))
          else finish(undefined, response.result)
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

  private readClientConfig() {
    try {
      const config = JSON.parse(readFileSync(this.clientConfigPath, 'utf8')) as HelperClientConfig
      if (config.version !== 1 || config.token.length < 32 || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) {
        throw new Error('invalid client configuration')
      }
      return config
    } catch (error) {
      throw new Error(`Relay Helper is not installed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private atomicWrite(path: string, value: unknown) {
    this.atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`)
  }

  private atomicWriteText(path: string, value: string) {
    const temporary = `${path}.${randomUUID()}.tmp`
    writeFileSync(temporary, value, { mode: 0o600 })
    renameSync(temporary, path)
  }
}

async function elevate(helperBinary: string, operation: 'install' | 'uninstall', source?: string) {
  const args = [`--${operation}`, ...(source ? ['--source', source] : [])]
  if (process.platform === 'win32') {
    const argumentList = args.map(powershell).join(',')
    const script = `$p=Start-Process -FilePath ${powershell(helperBinary)} -ArgumentList @(${argumentList}) -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script])
    return
  }
  if (process.platform === 'darwin') {
    const command = [helperBinary, ...args].map(shellQuote).join(' ')
    await execute('/usr/bin/osascript', ['-e', `do shell script ${appleScript(command)} with administrator privileges`])
    return
  }
  if (process.platform === 'linux') {
    await execute('pkexec', [helperBinary, ...args])
    return
  }
  throw new Error('Relay Helper elevation is unsupported on this platform')
}
