import { readFileSync } from 'node:fs'
import { createServer, type Socket } from 'node:net'
import process from 'node:process'
import { installHelper, uninstallHelper } from './installer'
import type { HelperConfig, HelperRequest, HelperResponse } from './protocol'
import { PrivilegedMihomoRuntime } from './runtime'

function argument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv.includes('--install')) {
  const source = argument('--source')
  if (!source) throw new Error('--source is required')
  installHelper(source)
  process.exit(0)
}

if (process.argv.includes('--uninstall')) {
  uninstallHelper()
  process.exit(0)
}

const configPath = argument('--config')
if (!process.argv.includes('--daemon') || !configPath) throw new Error('Relay Helper must run with --daemon --config')
const config = JSON.parse(readFileSync(configPath, 'utf8')) as HelperConfig
const runtime = new PrivilegedMihomoRuntime(config)

function write(socket: Socket, response: HelperResponse) {
  if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`)
}

const server = createServer((socket) => {
  socket.setEncoding('utf8')
  let buffer = ''
  let handled = false
  socket.on('data', (chunk: string) => {
    if (handled) return
    buffer += chunk
    if (buffer.length > 64 * 1024) {
      write(socket, { id: -1, error: 'Relay Helper request is too large' })
      return
    }
    const newline = buffer.indexOf('\n')
    if (newline < 0) return
    handled = true
    let request: HelperRequest
    try {
      request = JSON.parse(buffer.slice(0, newline)) as HelperRequest
    } catch {
      write(socket, { id: -1, error: 'Invalid Relay Helper request' })
      return
    }
    if (!request || typeof request.id !== 'number' || typeof request.token !== 'string'
      || !['status', 'start', 'stop'].includes(request.method)
      || (request.method === 'start' && typeof request.configPath !== 'string')) {
      write(socket, { id: typeof request?.id === 'number' ? request.id : -1, error: 'Invalid Relay Helper request' })
      return
    }
    if (!runtime.authenticated(request.token)) {
      write(socket, { id: request.id, error: 'Relay Helper authentication failed' })
      return
    }
    void runtime.handle(request)
      .then((result) => write(socket, { id: request.id, result }))
      .catch((error) => write(socket, { id: request.id, error: error instanceof Error ? error.message : String(error) }))
  })
})

server.listen(config.port, '127.0.0.1')

async function shutdown() {
  await runtime.stop()
  server.close(() => process.exit(0))
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
