import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from './settingsStore'

describe('SettingsStore', () => {
  const directories: string[] = []

  afterEach(() => {
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  })

  test('persists runtime preferences atomically', () => {
    const directory = mkdtempSync(join(tmpdir(), 'relay-settings-test-'))
    directories.push(directory)
    const store = new SettingsStore(directory)
    store.update({ mode: 'global', tun: true, allowLan: true, systemProxy: true })

    expect(new SettingsStore(directory).get()).toEqual({
      mode: 'global',
      tun: true,
      allowLan: true,
      systemProxy: true,
      ipv6: false,
      launchAtLogin: false,
    })
  })
})
