import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import type { RelaySettings } from '../core/types'

const defaults: RelaySettings = {
  systemProxy: false,
  tun: false,
  allowLan: false,
  ipv6: false,
  mode: 'rule',
}

function defaultRoot() {
  return process.env.RELAY_DATA_DIR ?? join(homedir(), '.config', 'relay')
}

export class SettingsStore {
  private readonly root: string
  private readonly path: string
  private settings: RelaySettings

  constructor(root = defaultRoot()) {
    this.root = root
    this.path = join(root, 'settings.json')
    mkdirSync(root, { recursive: true })
    this.settings = this.load()
  }

  get() {
    return { ...this.settings }
  }

  update(patch: Partial<RelaySettings>) {
    this.settings = { ...this.settings, ...patch }
    this.save()
    return this.get()
  }

  private load(): RelaySettings {
    if (!existsSync(this.path)) return { ...defaults }
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<RelaySettings>
      return {
        systemProxy: typeof value.systemProxy === 'boolean' ? value.systemProxy : defaults.systemProxy,
        tun: typeof value.tun === 'boolean' ? value.tun : defaults.tun,
        allowLan: typeof value.allowLan === 'boolean' ? value.allowLan : defaults.allowLan,
        ipv6: typeof value.ipv6 === 'boolean' ? value.ipv6 : defaults.ipv6,
        mode: value.mode === 'global' || value.mode === 'direct' ? value.mode : 'rule',
      }
    } catch (error) {
      throw new Error(`Unable to read Relay settings: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private save() {
    const temporaryPath = join(this.root, `.settings-${randomUUID()}.tmp`)
    writeFileSync(temporaryPath, `${JSON.stringify(this.settings, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporaryPath, this.path)
  }
}
