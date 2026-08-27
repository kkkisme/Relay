import { chmodSync, existsSync, unlinkSync } from 'node:fs'
import { createServer, type Socket } from 'node:net'
import { join } from 'node:path'
import process from 'node:process'
import type { CoreMethod, CoreRequest } from '../core/types'
import { RelayCoreService } from './service'

type CancelFrame = { type: 'cancel'; id: number }

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const endpoint = argument('--socket') ?? process.env.RELAY_CORE_SOCKET ?? (
  process.platform === 'win32'
    ? '\\\\.\\pipe\\relay-core'
    : join(process.env.TMPDIR ?? '/tmp', 'relay-core.sock')
)

if (process.platform !== 'win32' && existsSync(endpoint)) unlinkSync(endpoint)

const service = new RelayCoreService()
const sockets = new Set<Socket>()
const requests = new Map<Socket, Map<number, AbortController>>()

function write(socket: Socket, message: unknown) {
  if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`)
}

async function handleLine(socket: Socket, line: string) {
  let frame: CoreRequest | CancelFrame
  try {
    frame = JSON.parse(line) as CoreRequest | CancelFrame
  } catch {
    write(socket, { type: 'response', id: -1, error: 'Invalid JSON request' })
    return
  }

  if ('type' in frame) {
    if (frame.type === 'cancel') {
      requests.get(socket)?.get(frame.id)?.abort(new Error('Request cancelled by client'))
    }
    return
  }

  if (typeof frame.id !== 'number' || typeof frame.method !== 'string') {
    write(socket, { type: 'response', id: -1, error: 'Invalid RPC request' })
    return
  }

  const controller = new AbortController()
  requests.get(socket)?.set(frame.id, controller)
  try {
    const result = await service.handle(
      frame.method as CoreMethod,
      frame.arguments as never,
      controller.signal,
    )
    write(socket, { type: 'response', id: frame.id, result })
  } catch (error) {
    write(socket, {
      type: 'response',
      id: frame.id,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    requests.get(socket)?.delete(frame.id)
  }
}

const server = createServer((socket) => {
  sockets.add(socket)
  requests.set(socket, new Map())
  socket.setEncoding('utf8')
  let buffer = ''
  socket.on('data', (chunk: string) => {
    buffer += chunk
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) void handleLine(socket, line)
      newline = buffer.indexOf('\n')
    }
  })
  socket.on('close', () => {
    requests.get(socket)?.forEach((controller) => controller.abort())
    requests.delete(socket)
    sockets.delete(socket)
  })
  socket.on('error', () => socket.destroy())
})

server.listen(endpoint, () => {
  if (process.platform !== 'win32') chmodSync(endpoint, 0o600)
  process.stderr.write(`Relay Core listening on ${endpoint}\n`)
  void service.autoStart()
})

let publishing = false
const publisher = setInterval(async () => {
  if (publishing || sockets.size === 0) return
  publishing = true
  try {
    const data = await service.snapshot()
    sockets.forEach((socket) => write(socket, {
      type: 'event',
      event: { type: 'snapshot.updated', data },
    }))
  } catch (error) {
    service.reportError(error instanceof Error ? error.message : String(error))
  } finally {
    publishing = false
  }
}, 1000)

async function shutdown() {
  clearInterval(publisher)
  sockets.forEach((socket) => socket.destroy())
  try {
    await service.stop()
  } catch (error) {
    service.reportError(`Shutdown cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    server.close(() => {
      if (process.platform !== 'win32' && existsSync(endpoint)) unlinkSync(endpoint)
      process.exit(0)
    })
  }
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
