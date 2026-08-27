import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import type { HelperConfig } from './protocol'
import { PrivilegedMihomoRuntime } from './runtime'

function hash(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('PrivilegedMihomoRuntime', () => {
  const directories: string[] = []

  afterEach(() => {
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  })

  function harness() {
    const root = mkdtempSync(join(tmpdir(), 'relay-helper-runtime-'))
    directories.push(root)
    const configPath = join(root, 'runtime.yaml')
    writeFileSync(configPath, [
      'external-controller: 127.0.0.1:19090',
      'secret: 0123456789abcdef0123456789abcdef',
      '',
    ].join('\n'))
    const config: HelperConfig = {
      version: 1,
      token: 'a'.repeat(64),
      port: 51938,
      allowedRoot: root,
      runtimeRoot: join(root, 'privileged-runtime'),
      mihomoBinary: process.execPath,
      mihomoSha256: hash(process.execPath),
      helperBinary: process.execPath,
    }
    return { root, configPath, runtime: new PrivilegedMihomoRuntime(config) }
  }

  test('authenticates with a constant-time token and reports status', async () => {
    const test = harness()
    expect(test.runtime.authenticated('a'.repeat(64))).toBe(true)
    expect(test.runtime.authenticated('b'.repeat(64))).toBe(false)
    expect(await test.runtime.handle({ id: 1, token: 'a'.repeat(64), method: 'status' }))
      .toEqual(expect.objectContaining({ version: 1, running: false, logs: [] }))
  })

  test('rejects configuration paths outside managed storage', async () => {
    const test = harness()
    const outside = mkdtempSync(join(tmpdir(), 'relay-helper-outside-'))
    directories.push(outside)
    const outsideConfig = join(outside, 'runtime.yaml')
    writeFileSync(outsideConfig, readFileSync(test.configPath))
    await expect(test.runtime.handle({
      id: 1,
      token: 'a'.repeat(64),
      method: 'start',
      configPath: outsideConfig,
    })).rejects.toThrow('outside Relay managed storage')
  })

  test('rejects a privileged controller exposed beyond loopback', async () => {
    const test = harness()
    writeFileSync(test.configPath, [
      'external-controller: 0.0.0.0:19090',
      'secret: 0123456789abcdef0123456789abcdef',
      '',
    ].join('\n'))
    await expect(test.runtime.handle({
      id: 1,
      token: 'a'.repeat(64),
      method: 'start',
      configPath: test.configPath,
    })).rejects.toThrow('loopback')
  })
})
