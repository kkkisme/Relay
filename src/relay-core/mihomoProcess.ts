import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { MihomoClient } from './mihomoClient'

type LogSink = (level: 'debug' | 'info' | 'warning' | 'error', message: string) => void
type ConfigSource = { path: string; homeDirectory: string; name: string }

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

export class MihomoProcess {
  private child?: ChildProcess
  private clientValue?: MihomoClient
  private startedAt?: number
  private configPathValue = ''

  constructor(private readonly log: LogSink) {}

  get running() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed)
  }

  get client() {
    if (!this.running || !this.clientValue) throw new Error('Mihomo is not running')
    return this.clientValue
  }

  get uptimeMilliseconds() {
    return this.running && this.startedAt ? Date.now() - this.startedAt : 0
  }

  get configName() {
    return this.configPathValue ? basename(this.configPathValue, extname(this.configPathValue)) : 'runtime'
  }

  async start(signal?: AbortSignal, source?: ConfigSource) {
    if (this.running) return

    const binary = this.resolveBinary()
    const port = Number(process.env.RELAY_MIHOMO_CONTROLLER_PORT) || await findFreePort()
    const controller = process.env.RELAY_MIHOMO_CONTROLLER ?? `http://127.0.0.1:${port}`
    const secret = process.env.RELAY_MIHOMO_SECRET ?? randomBytes(24).toString('hex')
    const configDirectory = process.env.RELAY_MIHOMO_CONFIG_DIR
      ?? join(homedir(), '.config', 'relay', 'mihomo')
    mkdirSync(configDirectory, { recursive: true })

    const suppliedConfig = source?.path ?? process.env.RELAY_MIHOMO_CONFIG
    const runtimePath = join(configDirectory, 'relay-runtime.yaml')
    this.writeRuntimeConfig(runtimePath, suppliedConfig, controller, secret)
    const homeDirectory = source?.homeDirectory
      ?? (suppliedConfig ? dirname(suppliedConfig) : configDirectory)

    const args = process.env.RELAY_MIHOMO_ARGS && !source
      ? JSON.parse(process.env.RELAY_MIHOMO_ARGS) as string[]
      : ['-d', homeDirectory, '-f', runtimePath]
    const child = spawn(binary, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    this.startedAt = Date.now()
    this.configPathValue = source?.name ?? suppliedConfig ?? runtimePath
    this.clientValue = new MihomoClient(controller, secret)

    this.pipeLogs(child.stdout, 'info')
    this.pipeLogs(child.stderr, 'error')
    child.once('error', (error) => this.log('error', `Failed to start Mihomo: ${error.message}`))
    child.once('exit', (code, childSignal) => {
      if (this.child !== child) return
      this.child = undefined
      this.clientValue = undefined
      this.startedAt = undefined
      const detail = childSignal ? `signal ${childSignal}` : `code ${code ?? 'unknown'}`
      this.log(code === 0 ? 'info' : 'error', `Mihomo exited with ${detail}`)
    })

    try {
      await this.waitUntilReady(signal)
      this.log('info', `Mihomo started from ${source?.name ?? suppliedConfig ?? 'Relay bootstrap profile'}`)
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop() {
    const child = this.child
    if (!child) return
    this.child = undefined
    this.clientValue = undefined
    this.startedAt = undefined
    child.kill()
    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      wait(2000),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
    this.log('info', 'Mihomo stopped')
  }

  async validateConfig(path: string, homeDirectory: string, signal?: AbortSignal) {
    const binary = this.resolveBinary()
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, ['-t', '-d', homeDirectory, '-f', path], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let output = ''
      let settled = false
      const collect = (chunk: Buffer | string) => {
        output = `${output}${chunk}`.slice(-16_000)
      }
      child.stdout?.on('data', collect)
      child.stderr?.on('data', collect)
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener('abort', cancel)
        if (error) reject(error)
        else resolve()
      }
      const cancel = () => {
        child.kill()
        finish(signal?.reason instanceof Error ? signal.reason : new Error('Profile validation cancelled'))
      }
      const timeout = setTimeout(() => {
        child.kill()
        finish(new Error('Mihomo profile validation timed out'))
      }, 15_000)
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
      child.once('error', (error) => finish(error))
      child.once('close', (code) => {
        if (code === 0) finish()
        else finish(new Error(`Mihomo rejected the profile: ${output.trim() || `exit code ${code ?? 'unknown'}`}`))
      })
    })
  }

  private resolveBinary() {
    const configured = process.env.RELAY_MIHOMO_BINARY
    if (configured) return configured
    const name = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
    const candidates = [
      join(dirname(process.execPath), name),
      join(process.cwd(), 'dist', name),
      join(process.cwd(), 'bin', name),
    ]
    const binary = candidates.find(existsSync)
    if (!binary) {
      throw new Error(`Mihomo binary not found. Set RELAY_MIHOMO_BINARY or place ${name} beside Relay.`)
    }
    return binary
  }

  private writeRuntimeConfig(
    runtimePath: string,
    suppliedConfig: string | undefined,
    controller: string,
    secret: string,
  ) {
    const configuration = suppliedConfig
      ? parse(readFileSync(suppliedConfig, 'utf8')) as Record<string, unknown>
      : {
          'mixed-port': 7890,
          'allow-lan': false,
          mode: 'rule',
          'log-level': 'info',
          proxies: [],
          'proxy-groups': [],
          rules: [],
        }
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
      throw new Error('Mihomo profile must contain a YAML object')
    }
    configuration['external-controller'] = controller.replace(/^https?:\/\//, '')
    configuration.secret = secret
    writeFileSync(runtimePath, stringify(configuration), { mode: 0o600 })
  }

  private async waitUntilReady(signal?: AbortSignal) {
    let lastError: unknown
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (signal?.aborted) throw signal.reason
      if (!this.running) throw new Error('Mihomo exited before its API became ready')
      try {
        await this.client.snapshot(signal)
        return
      } catch (error) {
        lastError = error
        await wait(200)
      }
    }
    throw new Error(`Mihomo API did not become ready: ${lastError instanceof Error ? lastError.message : 'unknown error'}`)
  }

  private pipeLogs(stream: NodeJS.ReadableStream | null, fallback: 'info' | 'error') {
    if (!stream) return
    let buffer = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) this.log(this.levelFromLine(line, fallback), line)
        newline = buffer.indexOf('\n')
      }
    })
  }

  private levelFromLine(line: string, fallback: 'info' | 'error') {
    const normalized = line.toLowerCase()
    if (normalized.includes('debug')) return 'debug' as const
    if (normalized.includes('warn')) return 'warning' as const
    if (normalized.includes('error') || normalized.includes('fatal')) return 'error' as const
    return fallback
  }
}
