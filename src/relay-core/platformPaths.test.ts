import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { relayPaths } from './platformPaths'

describe('relayPaths', () => {
  test('uses platform-native application data locations', () => {
    expect(relayPaths('win32', { APPDATA: 'C:\\Users\\relay\\AppData\\Roaming' }, 'C:\\Users\\relay').root)
      .toBe(join('C:\\Users\\relay\\AppData\\Roaming', 'Relay'))
    expect(relayPaths('darwin', {}, '/Users/relay').root)
      .toBe(join('/Users/relay', 'Library', 'Application Support', 'Relay'))
    const linux = relayPaths('linux', {}, '/home/relay')
    expect(linux.root).toBe(join('/home/relay', '.config', 'relay'))
    expect(linux.logs).toBe(join('/home/relay', '.local', 'state', 'relay', 'logs'))
  })

  test('honors explicit storage overrides', () => {
    const paths = relayPaths('linux', {
      RELAY_DATA_DIR: '/data/relay',
      RELAY_PROFILE_DIR: '/data/profiles',
      RELAY_MIHOMO_CONFIG_DIR: '/data/mihomo',
      XDG_STATE_HOME: '/state',
    }, '/home/relay')

    expect(paths.root).toBe('/data/relay')
    expect(paths.profiles).toBe('/data/profiles')
    expect(paths.mihomo).toBe('/data/mihomo')
    expect(paths.logs).toBe(join('/state', 'relay', 'logs'))
  })
})
