import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import type { CoreEventListener, CoreTransport } from './transport'
import type { CoreEvent, CoreMethod, CoreMethodMap, CoreRequest, CoreResponse } from './types'

type WireResponse = { type: 'response'; id: number; result?: unknown; error?: string }
type WireEvent = { type: 'event'; event: CoreEvent }
type PendingRequest = {
  resolve: (response: CoreResponse<unknown>) => void
  timer: ReturnType<typeof setTimeout>
}

const retryDelays = [40, 80, 160, 320, 640, 1000, 1500]

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

function coreExecutable() {
  if (process.env.RELAY_CORE_BINARY) return process.env.RELAY_CORE_BINARY
  const name = process.platform === 'win32' ? 'relay-core.exe' : 'relay-core'
  const candidates = [
    join(dirname(process.execPath), name),
    join(process.cwd(), 'dist', name),
    join(process.cwd(), 'bin', name),
  ]
  return candidates.find(existsSync) ?? candidates[1]
}

function coreEndpoint() {
  if (process.env.RELAY_CORE_SOCKET) return process.env.RELAY_CORE_SOCKET
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\relay-core-${process.pid}`
    : join(tmpdir(), `relay-core-${process.pid}.sock`)
}

export class ProcessCoreTransport implements CoreTransport {
  private readonly endpoint = coreEndpoint()
  private child?: ChildProcess
  private socket?: Socket
  private buffer = ''
  private listeners = new Set<CoreEventListener>()
  private pending = new Map<number, PendingRequest>()
  private connectTask?: Promise<void>
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectAttempt = 0
  private stopping = false

  connect() {
    this.stopping = false
    return this.ensureConnected()
  }

  async disconnect() {
    this.stopping = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.rejectPending('Relay Core disconnected')
    this.socket?.destroy()
    this.socket = undefined

    const child = this.child
    this.child = undefined
    if (child && child.exitCode === null) {
      child.kill()
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        delay(1500),
      ])
    }
  }

  subscribe(listener: CoreEventListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async request<K extends CoreMethod>(
    request: CoreRequest<K>,
  ): Promise<CoreResponse<CoreMethodMap[K]['result']>> {
    await this.ensureConnected()
    const socket = this.socket
    if (!socket || socket.destroyed) throw new Error('Relay Core connection is unavailable')

    return new Promise((resolve, reject) => {
      const timeoutMilliseconds = request.method.startsWith('tun.') ? 180_000 : 10_000
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        this.write({ type: 'cancel', id: request.id })
        reject(new Error(`Relay Core request timed out: ${request.method}`))
      }, timeoutMilliseconds)

      this.pending.set(request.id, {
        resolve: resolve as (response: CoreResponse<unknown>) => void,
        timer,
      })
      socket.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) return
        clearTimeout(timer)
        this.pending.delete(request.id)
        reject(error)
      })
    })
  }

  private ensureConnected() {
    if (this.socket && !this.socket.destroyed) return Promise.resolve()
    if (this.connectTask) return this.connectTask
    this.connectTask = this.open().finally(() => {
      this.connectTask = undefined
    })
    return this.connectTask
  }

  private async open() {
    this.spawnCore()
    let lastError: Error | undefined
    for (const milliseconds of retryDelays) {
      if (this.stopping) throw new Error('Relay Core connection cancelled')
      try {
        this.socket = await this.openSocket()
        this.reconnectAttempt = 0
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        await delay(milliseconds)
      }
    }
    throw new Error(`Unable to connect to Relay Core: ${lastError?.message ?? 'unknown error'}`)
  }

  private spawnCore() {
    if (this.child && this.child.exitCode === null) return
    const executable = coreExecutable()
    const executableName = basename(process.execPath).toLowerCase()
    const appBinary = process.env.RELAY_APP_BINARY
      ?? (executableName === 'relay' || executableName === 'relay.exe' ? process.execPath : undefined)
    const child = spawn(executable, ['--socket', this.endpoint], {
      env: {
        ...process.env,
        ...(appBinary ? { RELAY_APP_BINARY: appBinary } : {}),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (message: string) => console.error(`[relay-core] ${message.trimEnd()}`))
    child.once('error', (error) => console.error(`[relay-core] ${error.message}`))
    child.once('exit', () => {
      if (this.child === child) this.child = undefined
      if (!this.stopping) this.scheduleReconnect()
    })
  }

  private openSocket() {
    return new Promise<Socket>((resolve, reject) => {
      const socket = createConnection(this.endpoint)
      const fail = (error: Error) => {
        socket.destroy()
        reject(error)
      }
      socket.once('error', fail)
      socket.once('connect', () => {
        socket.off('error', fail)
        socket.setEncoding('utf8')
        socket.on('data', (chunk: string) => this.consume(chunk))
        socket.on('error', () => socket.destroy())
        socket.on('close', () => this.onSocketClosed(socket))
        resolve(socket)
      })
    })
  }

  private consume(chunk: string) {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.consumeLine(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private consumeLine(line: string) {
    try {
      const message = JSON.parse(line) as WireResponse | WireEvent
      if (message.type === 'event') {
        this.listeners.forEach((listener) => listener(message.event))
        return
      }
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      pending.resolve({ id: message.id, result: message.result, error: message.error })
    } catch (error) {
      console.error('[relay-core] Invalid RPC frame', error)
    }
  }

  private onSocketClosed(socket: Socket) {
    if (this.socket !== socket) return
    this.socket = undefined
    this.buffer = ''
    this.rejectPending('Relay Core connection closed')
    if (!this.stopping) this.scheduleReconnect()
  }

  private scheduleReconnect() {
    if (this.stopping || this.reconnectTimer || this.connectTask) return
    const wait = Math.min(250 * 2 ** this.reconnectAttempt++, 5000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.ensureConnected().catch((error) => {
        console.error('[relay-core] Reconnect failed', error)
        this.scheduleReconnect()
      })
    }, wait)
  }

  private write(message: unknown) {
    if (this.socket && !this.socket.destroyed) this.socket.write(`${JSON.stringify(message)}\n`)
  }

  private rejectPending(message: string) {
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer)
      resolve({ id: -1, error: message })
    }
    this.pending.clear()
  }
}
