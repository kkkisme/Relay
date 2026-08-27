import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync } from 'node:fs'
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'
import type { HelperConfig, HelperRequest, HelperStatus } from './protocol'

function inside(root: string, candidate: string) {
  const value = relative(root, candidate)
  return value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export class PrivilegedMihomoRuntime {
  private child?: ChildProcess
  private startedAt?: string
  private lastExit?: HelperStatus['exit']
  private logs: string[] = []

  constructor(private readonly config: HelperConfig) {
    this.validateInstallation()
  }

  authenticated(token: unknown) {
    if (typeof token !== 'string') return false
    const expected = Buffer.from(this.config.token)
    const supplied = Buffer.from(token)
    return expected.length === supplied.length && timingSafeEqual(expected, supplied)
  }

  async handle(request: HelperRequest) {
    if (request.method === 'status') return this.status()
    if (request.method === 'stop') {
      await this.stop()
      return this.status()
    }
    await this.start(request.configPath)
    return this.status()
  }

  status(): HelperStatus {
    return {
      version: 1,
      running: this.running,
      pid: this.running ? this.child?.pid : undefined,
      startedAt: this.running ? this.startedAt : undefined,
      exit: this.lastExit,
      logs: [...this.logs],
    }
  }

  get running() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed)
  }

  async start(configPath: string) {
    if (this.running) return
    const sourceConfig = this.authorizedPath(configPath, false)
    this.validateBinaryHash()
    this.validateRuntimeConfig(sourceConfig)
    mkdirSync(this.config.runtimeRoot, { recursive: true })
    const runtimeConfig = join(this.config.runtimeRoot, 'relay-runtime.yaml')
    const temporaryConfig = `${runtimeConfig}.${process.pid}.tmp`
    copyFileSync(sourceConfig, temporaryConfig)
    renameSync(temporaryConfig, runtimeConfig)

    const child = spawn(this.config.mihomoBinary, ['-d', this.config.runtimeRoot, '-f', runtimeConfig], {
      cwd: this.config.runtimeRoot,
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        WINDIR: process.env.WINDIR,
        TMP: process.env.TMP,
        TEMP: process.env.TEMP,
        SAFE_PATHS: `${this.config.runtimeRoot}${delimiter}${this.config.allowedRoot}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    this.startedAt = new Date().toISOString()
    this.lastExit = undefined
    this.pipe(child.stdout, 'stdout')
    this.pipe(child.stderr, 'stderr')
    child.once('error', (error) => {
      this.push(`error ${error.message}`)
      if (this.child === child) {
        this.child = undefined
        this.startedAt = undefined
        this.lastExit = { code: null, signal: null }
      }
    })
    child.once('exit', (code, signal) => {
      if (this.child !== child) return
      this.lastExit = { code, signal }
      this.child = undefined
      this.startedAt = undefined
      this.push(`exit ${signal ?? code ?? 'unknown'}`)
    })
    await new Promise<void>((resolveValue, reject) => {
      child.once('spawn', () => resolveValue())
      child.once('error', reject)
    })
  }

  async stop() {
    const child = this.child
    if (!child) return
    this.child = undefined
    this.startedAt = undefined
    child.kill()
    await Promise.race([
      new Promise<void>((resolveValue) => child.once('exit', () => resolveValue())),
      new Promise<void>((resolveValue) => setTimeout(resolveValue, 2_000)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }

  private validateInstallation() {
    if (this.config.version !== 1 || this.config.token.length < 32) throw new Error('Invalid Relay Helper configuration')
    if (!Number.isInteger(this.config.port) || this.config.port < 1024 || this.config.port > 65535) {
      throw new Error('Invalid Relay Helper port')
    }
    if (!isAbsolute(this.config.allowedRoot) || !isAbsolute(this.config.runtimeRoot) || !isAbsolute(this.config.mihomoBinary)) {
      throw new Error('Relay Helper paths must be absolute')
    }
    this.validateBinaryHash()
  }

  private validateBinaryHash() {
    const metadata = statSync(this.config.mihomoBinary)
    if (!metadata.isFile()) throw new Error('Configured Mihomo path is not a regular file')
    if (sha256(this.config.mihomoBinary) !== this.config.mihomoSha256) {
      throw new Error('Mihomo binary changed; reinstall Relay Helper before using TUN')
    }
  }

  private authorizedPath(path: string, directory: boolean) {
    if (!isAbsolute(path)) throw new Error('Privileged Mihomo paths must be absolute')
    const root = realpathSync(this.config.allowedRoot)
    const candidate = realpathSync(resolve(path))
    if (!inside(root, candidate)) throw new Error('Privileged Mihomo path is outside Relay managed storage')
    const metadata = statSync(candidate)
    if (directory ? !metadata.isDirectory() : !metadata.isFile()) throw new Error('Privileged Mihomo path has the wrong type')
    return candidate
  }

  private validateRuntimeConfig(path: string) {
    const config = parse(readFileSync(path, 'utf8')) as Record<string, unknown> | null
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid Mihomo runtime configuration')
    const controller = config['external-controller']
    if (typeof controller !== 'string' || !/^(127\.0\.0\.1|localhost):\d+$/.test(controller)) {
      throw new Error('Privileged Mihomo controller must use a loopback address')
    }
    if (typeof config.secret !== 'string' || config.secret.length < 16) {
      throw new Error('Privileged Mihomo controller requires a strong secret')
    }
  }

  private pipe(stream: NodeJS.ReadableStream | null, name: string) {
    if (!stream) return
    let buffer = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) this.push(`${name} ${line}`)
        newline = buffer.indexOf('\n')
      }
    })
  }

  private push(message: string) {
    this.logs = [...this.logs, `${new Date().toISOString()} ${message}`].slice(-100)
  }
}
