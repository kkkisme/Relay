import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ProfileStore } from './profileStore'

const validProfile = (port: number) => [
  `mixed-port: ${port}`,
  'proxies:',
  '  - name: Test',
  '    type: socks5',
  '    server: 127.0.0.1',
  '    port: 1080',
  'rules:',
  '  - MATCH,DIRECT',
  '',
].join('\n')

describe('ProfileStore', () => {
  const temporaryDirectories: string[] = []

  afterEach(() => {
    temporaryDirectories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  })

  function temporaryDirectory() {
    const path = mkdtempSync(join(tmpdir(), 'relay-profile-test-'))
    temporaryDirectories.push(path)
    return path
  }

  test('imports, updates, rolls back, and reloads a local profile', async () => {
    const directory = temporaryDirectory()
    const source = join(directory, 'source.yaml')
    const validated: Array<{ path: string; home: string }> = []
    writeFileSync(source, validProfile(7890))
    const store = new ProfileStore(async (path, home) => {
      validated.push({ path, home })
      expect(readFileSync(path, 'utf8')).toContain('mixed-port')
    }, { root: join(directory, 'managed') })

    const imported = await store.importProfile({ name: 'Local', source: 'local', location: source })
    expect(imported.revision).toBe(1)
    expect(store.list()[0]).toEqual(expect.objectContaining({
      name: 'Local',
      proxies: 1,
      rules: 1,
      canRollback: false,
    }))
    expect(validated[0]?.home).toBe(dirname(source))

    writeFileSync(source, validProfile(7891))
    await store.update(imported.profileId)
    expect(store.list()[0]).toEqual(expect.objectContaining({ revision: 2, canRollback: true }))

    const rolledBack = store.rollback(imported.profileId)
    expect(rolledBack.revision).toBe(1)
    expect(readFileSync(rolledBack.path, 'utf8')).toContain('7890')

    store.activate(imported.profileId)
    const reloaded = new ProfileStore(async () => {}, { root: join(directory, 'managed') })
    expect(reloaded.activeConfig()).toEqual(expect.objectContaining({
      profileId: imported.profileId,
      revision: 1,
    }))
  })

  test('downloads and validates a remote YAML subscription', async () => {
    const directory = temporaryDirectory()
    let requestedUrl = ''
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrl = String(input)
      return new Response(validProfile(7892), {
        headers: { 'content-type': 'application/yaml' },
      })
    }) as typeof fetch
    const store = new ProfileStore(async () => {}, {
      root: join(directory, 'managed'),
      fetcher,
    })

    const imported = await store.importProfile({
      name: 'Remote',
      source: 'remote',
      location: 'https://example.com/config.yaml',
    })
    expect(requestedUrl).toBe('https://example.com/config.yaml')
    expect(imported.name).toBe('Remote')
    expect(store.list()[0]?.source).toBe('remote')
  })

  test('rejects invalid YAML before it is persisted', async () => {
    const directory = temporaryDirectory()
    const source = join(directory, 'broken.yaml')
    writeFileSync(source, 'proxies: [')
    const store = new ProfileStore(async () => {}, { root: join(directory, 'managed') })

    await expect(store.importProfile({ name: 'Broken', source: 'local', location: source })).rejects.toThrow()
    expect(store.list()).toHaveLength(0)
  })
})
