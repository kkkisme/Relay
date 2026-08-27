import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SystemProxyManager, createSystemProxyAdapter, type SystemProxyAdapter } from './systemProxy'

describe('SystemProxyManager', () => {
  const directories: string[] = []

  afterEach(() => {
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  })

  function harness() {
    const directory = mkdtempSync(join(tmpdir(), 'relay-proxy-test-'))
    directories.push(directory)
    const recovery = join(directory, 'recovery.json')
    let state: unknown = { enabled: false, server: 'original:8080' }
    const restored: unknown[] = []
    const applied: number[] = []
    const adapter: SystemProxyAdapter = {
      platform: 'test',
      capture: async () => structuredClone(state),
      apply: async (port) => {
        applied.push(port)
        state = { enabled: true, server: `127.0.0.1:${port}` }
      },
      restore: async (value) => {
        restored.push(value)
        state = structuredClone(value)
      },
      enabled: async () => (state as { enabled: boolean }).enabled,
    }
    return { adapter, applied, recovery, restored, state: () => state }
  }

  test('captures state before applying and restores it on disable', async () => {
    const test = harness()
    const manager = new SystemProxyManager(test.adapter, test.recovery)

    await manager.enable(7890)
    expect(test.applied).toEqual([7890])
    expect(JSON.parse(readFileSync(test.recovery, 'utf8'))).toEqual(expect.objectContaining({
      version: 1,
      platform: 'test',
      port: 7890,
      state: { enabled: false, server: 'original:8080' },
    }))
    expect(await manager.status()).toEqual({ supported: true, enabled: true, managed: true })

    await manager.disable()
    expect(test.restored).toEqual([{ enabled: false, server: 'original:8080' }])
    expect(test.state()).toEqual({ enabled: false, server: 'original:8080' })
    expect(existsSync(test.recovery)).toBe(false)
  })

  test('recovers a stale marker after an interrupted process', async () => {
    const test = harness()
    await new SystemProxyManager(test.adapter, test.recovery).enable(7891)

    const recovered = await new SystemProxyManager(test.adapter, test.recovery).recoverStale()

    expect(recovered).toBe(true)
    expect(test.state()).toEqual({ enabled: false, server: 'original:8080' })
    expect(existsSync(test.recovery)).toBe(false)
  })

  test('rolls back when applying the proxy fails', async () => {
    const test = harness()
    test.adapter.apply = async () => {
      throw new Error('apply failed')
    }
    const manager = new SystemProxyManager(test.adapter, test.recovery)

    await expect(manager.enable(7892)).rejects.toThrow('apply failed')
    expect(test.restored).toEqual([{ enabled: false, server: 'original:8080' }])
    expect(existsSync(test.recovery)).toBe(false)
  })

  test('builds adapters only for supported desktop platforms', () => {
    const runner = async () => ''
    expect(createSystemProxyAdapter('win32', runner)?.platform).toBe('win32')
    expect(createSystemProxyAdapter('darwin', runner)?.platform).toBe('darwin')
    expect(createSystemProxyAdapter('linux', runner)?.platform).toBe('linux')
    expect(createSystemProxyAdapter('aix', runner)).toBeUndefined()
  })
})
