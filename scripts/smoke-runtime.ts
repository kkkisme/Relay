import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'relay runtime smoke '))
// Also prove that role selection survives executable renaming and spaces in paths.
const binary = join(root, process.platform === 'win32' ? 'renamed relay.exe' : 'renamed relay')
const children: ChildProcess[] = []
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms))

function start(args: string[]) {
  const child = spawn(binary, args, {
    cwd: root,
    env: { ...process.env, RELAY_DATA_DIR: root, RELAY_MIHOMO_AUTO_START: '0' },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  })
  let diagnostic = ''
  child.stderr?.on('data', (data) => { diagnostic += data })
  child.on('error', (error) => { diagnostic += error.message })
  children.push(child)
  return () => diagnostic
}

function request(endpoint: string | number, frame: object): Promise<any> {
  return new Promise((done, fail) => {
    const socket = typeof endpoint === 'number'
      ? createConnection(endpoint, '127.0.0.1') : createConnection(endpoint)
    let buffer = ''
    const timer = setTimeout(() => { socket.destroy(); fail(new Error('RPC timed out')) }, 3000)
    socket.setEncoding('utf8')
    socket.once('error', (error) => { clearTimeout(timer); socket.destroy(); fail(error) })
    socket.once('connect', () => socket.write(`${JSON.stringify(frame)}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()!
      for (const line of lines) {
        try {
          const response = JSON.parse(line)
          if (response.id !== 1) continue
          clearTimeout(timer)
          socket.destroy()
          done(response)
        } catch (error) { clearTimeout(timer); socket.destroy(); fail(error) }
      }
    })
  })
}

async function ready(endpoint: string | number, frame: object, diagnostic: () => string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { return await request(endpoint, frame) } catch { await delay(100) }
  }
  throw new Error(`Packaged role did not answer RPC: ${diagnostic()}`)
}

try {
  copyFileSync(resolve(process.argv[2] ?? (process.platform === 'win32' ? 'dist/relay.exe' : 'dist/relay')), binary)
  if (process.platform !== 'win32') chmodSync(binary, 0o755)
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\relay-smoke-${process.pid}` : join(root, 'core.sock')
  const coreLog = start(['--core', '--socket', endpoint])
  const core = await ready(endpoint, { id: 1, method: 'core.snapshot', arguments: {} }, coreLog)
  assert.equal(core.error, undefined)
  assert.equal(core.result.status.running, false)

  const port = await new Promise<number>((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number }
      server.close((error) => error ? fail(error) : done(address.port))
    })
  })
  const token = 'a'.repeat(64)
  const config = join(root, 'helper config.json')
  // Status-only smoke check: this binary is pinned but never launched as Mihomo.
  writeFileSync(config, JSON.stringify({
    version: 1, token, port, allowedRoot: root, runtimeRoot: join(root, 'runtime'),
    helperBinary: binary, mihomoBinary: binary,
    mihomoSha256: createHash('sha256').update(readFileSync(binary)).digest('hex'),
  }))
  const helperLog = start(['--helper', '--daemon', '--config', config])
  const helper = await ready(port, { id: 1, token, method: 'status' }, helperLog)
  assert.equal(helper.error, undefined)
  assert.equal(helper.result.running, false)
  const rejected = await request(port, { id: 1, token: 'wrong', method: 'status' })
  assert.match(rejected.error, /authentication failed/)
  console.log('Packaged Core RPC and Helper authentication passed (renamed binary, paths with spaces).')
} finally {
  await Promise.all(children.map(async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>((done) => child.once('exit', () => done()))
    child.kill()
    await Promise.race([exited, delay(3000)])
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  }))
  rmSync(root, { recursive: true, force: true })
}
