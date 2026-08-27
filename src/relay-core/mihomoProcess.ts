import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import process from 'node:process'
import { MihomoClient } from './mihomoClient'

type LogSink = (level: 'debug' | 'info' | 'warning' | 'error', message: string) => void

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

function quoteYaml(value: string) {
  return JSON.stringify(value)
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

  async start(signal?: AbortSignal) {
    if (this.running) return

    const binary = this.resolveBinary()
    const port = Number(process.env.RELAY_MIHOMO_CONTROLLER_PORT) || await findFreePort()
    const controller = process.env.RELAY_MIHOMO_CONTROLLER ?? `http://127.0.0.1:${port}`
    const secret = process.env.RELAY_MIHOMO_SECRET ?? randomBytes(24).toString('hex')
    const configDirectory = process.env.RELAY_MIHOMO_CONFIG_DIR
      ?? join(homedir(), '.config', 'relay', 'mihomo')
    mkdirSync(configDirectory, { recursive: true })

    const suppliedConfig = process.env.RELAY_MIHOMO_CONFIG
    const configPath = suppliedConfig ?? join(configDirectory, 'relay-bootstrap.yaml')
    if (!suppliedConfig) {
      writeFileSync(configPath, [
        'mixed-port: 7890',
        'allow-lan: false',
        'mode: rule',
        'log-level: info',
        `external-controller: ${quoteYaml(controller.replace(/^https?:\/\//, ''))}`,
        `secret: ${quoteYaml(secret)}`,
        'proxies: []',
        'proxy-groups: []',
        'rules: []',
        '',
      ].join('\n'), { mode: 0o600 })
    }

    const args = process.env.RELAY_MIHOMO_ARGS
      ? JSON.parse(process.env.RELAY_MIHOMO_ARGS) as string[]
      : ['-d', configDirectory, '-f', configPath]
    const child = spawn(binary, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    this.startedAt = Date.now()
    this.configPathValue = configPath
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
      this.log('info', `Mihomo started from ${configPath}`)
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
