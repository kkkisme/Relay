import { afterEach, describe, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import type { HelperConfig, HelperRequest } from '../relay-helper/protocol'
import { PrivilegedHelperManager } from './privilegedHelper'

describe('PrivilegedHelperManager', () => {
  const directories: string[] = []
  const servers: Server[] = []
  const children: ChildProcess[] = []

  afterEach(() => {
    servers.splice(0).forEach((server) => server.close())
    children.splice(0).forEach((child) => child.kill())
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  })

  test('installs, authenticates, controls, and uninstalls a helper', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-helper-client-'))
    directories.push(root)
    const helperBinary = join(root, 'relay-helper')
    const mihomoBinary = join(root, 'mihomo')
    const clientConfigPath = join(root, 'helper-client.json')
    writeFileSync(helperBinary, 'helper')
    writeFileSync(mihomoBinary, 'mihomo')
    let installedConfig: HelperConfig | undefined
    let running = false
    const operations: string[] = []

    const manager = new PrivilegedHelperManager({
      platform: 'linux',
      helperBinary,
      dataRoot: root,
      clientConfigPath,
      elevationRunner: async (_binary, operation, source) => {
        operations.push(operation)
        if (operation === 'uninstall') return
        installedConfig = JSON.parse(readFileSync(source!, 'utf8')) as HelperConfig
        const server = createServer((socket) => {
          socket.setEncoding('utf8')
          socket.once('data', (line: string) => {
            const request = JSON.parse(line) as HelperRequest
            expect(request.token).toBe(installedConfig!.token)
            if (request.method === 'start') running = true
            if (request.method === 'stop') running = false
            socket.end(`${JSON.stringify({
              id: request.id,
              result: { version: 1, running, logs: [] },
            })}\n`)
          })
        })
        servers.push(server)
        await new Promise<void>((resolveValue, reject) => {
          server.once('error', reject)
          server.listen(installedConfig!.port, '127.0.0.1', () => resolveValue())
        })
      },
    })

    expect((await manager.state()).state).toBe('not-installed')
    await manager.install(mihomoBinary)
    expect(installedConfig).toEqual(expect.objectContaining({
      version: 1,
      allowedRoot: root,
      helperBinary,
      mihomoBinary,
    }))
    expect(installedConfig?.mihomoSha256).toHaveLength(64)
    expect((await manager.state()).state).toBe('ready')

    await manager.start(join(root, 'runtime.yaml'))
    expect((await manager.status()).running).toBe(true)
    await manager.uninstall()

    expect(operations).toEqual(['install', 'uninstall'])
    expect(existsSync(clientConfigPath)).toBe(false)
  })

  test('connects to the real loopback helper daemon', async () => {
    const root = mkdtempSync(join(tmpdir(), 'relay-helper-daemon-'))
    directories.push(root)
    const port = await new Promise<number>((resolveValue, reject) => {
      const probe = createServer()
      probe.once('error', reject)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        const value = typeof address === 'object' && address ? address.port : 0
        probe.close((error) => error ? reject(error) : resolveValue(value))
      })
    })
    const token = 'c'.repeat(64)
    const configPath = join(root, 'system-helper.json')
    const clientConfigPath = join(root, 'helper-client.json')
    const config: HelperConfig = {
      version: 1,
      token,
      port,
      allowedRoot: root,
      runtimeRoot: join(root, 'runtime'),
      mihomoBinary: process.execPath,
      mihomoSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
      helperBinary: process.execPath,
    }
    writeFileSync(configPath, JSON.stringify(config))
    writeFileSync(clientConfigPath, JSON.stringify({ version: 1, token, port }))
    const main = join(import.meta.dir, '..', 'relay-helper', 'main.ts')
    const child = spawn(process.execPath, [main, '--daemon', '--config', configPath], {
      stdio: 'ignore',
      windowsHide: true,
    })
    children.push(child)
    const manager = new PrivilegedHelperManager({
      helperBinary: process.execPath,
      clientConfigPath,
      dataRoot: root,
    })

    let status
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        status = await manager.status()
        break
      } catch {
        await new Promise((resolveValue) => setTimeout(resolveValue, 50))
      }
    }
    expect(status).toEqual(expect.objectContaining({ version: 1, running: false }))
    child.kill()
  })
})
