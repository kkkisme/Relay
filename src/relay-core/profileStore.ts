import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'
import type { Profile } from '../core/types'

type ProfileSource = 'remote' | 'local'
type Revision = {
  revision: number
  file: string
  createdAt: string
  sha256: string
  proxies: number
  rules: number
}

type StoredProfile = {
  id: string
  name: string
  source: ProfileSource
  location: string
  active: boolean
  currentRevision: number
  revisions: Revision[]
}

type StoreDocument = {
  version: 1
  profiles: StoredProfile[]
}

type ConfigTarget = {
  profileId: string
  name: string
  path: string
  homeDirectory: string
  revision: number
}

type Validator = (path: string, homeDirectory: string, signal?: AbortSignal) => Promise<void>

const maxProfileBytes = 8 * 1024 * 1024

function defaultRoot() {
  return process.env.RELAY_PROFILE_DIR ?? join(homedir(), '.config', 'relay', 'profiles')
}

function configStats(content: string) {
  const document = parse(content) as Record<string, unknown> | null
  if (!document || typeof document !== 'object') throw new Error('Profile must contain a YAML object')
  return {
    proxies: Array.isArray(document.proxies) ? document.proxies.length : 0,
    rules: Array.isArray(document.rules) ? document.rules.length : 0,
  }
}

export class ProfileStore {
  private readonly root: string
  private readonly indexPath: string
  private document: StoreDocument

  constructor(
    private readonly validate: Validator,
    options: { root?: string; fetcher?: typeof fetch } = {},
  ) {
    this.root = options.root ?? defaultRoot()
    this.fetcher = options.fetcher ?? fetch
    this.indexPath = join(this.root, 'profiles.json')
    mkdirSync(this.root, { recursive: true })
    this.document = this.load()
  }

  private readonly fetcher: typeof fetch

  list(): Profile[] {
    return this.document.profiles.map((profile) => {
      const revision = this.revision(profile)
      return {
        id: profile.id,
        name: profile.name,
        source: profile.source,
        active: profile.active,
        updatedAt: revision.createdAt,
        proxies: revision.proxies,
        rules: revision.rules,
        revision: revision.revision,
        canUpdate: true,
        canRollback: profile.revisions.some((item) => item.revision < profile.currentRevision),
      }
    })
  }

  activeConfig() {
    const active = this.document.profiles.find((profile) => profile.active)
    return active ? this.target(active) : undefined
  }

  config(profileId: string) {
    const profile = this.requireProfile(profileId)
    return this.target(profile)
  }

  async importProfile(
    input: { name: string; source: ProfileSource; location: string },
    signal?: AbortSignal,
  ) {
    const name = input.name.trim()
    const location = input.location.trim()
    if (!name) throw new Error('Profile name is required')
    if (!location) throw new Error('Profile location is required')

    const normalizedLocation = input.source === 'remote'
      ? this.remoteUrl(location)
      : resolve(location)
    const content = input.source === 'remote'
      ? await this.download(normalizedLocation, signal)
      : this.readLocal(normalizedLocation)
    const profile: StoredProfile = {
      id: randomUUID(),
      name,
      source: input.source,
      location: normalizedLocation,
      active: false,
      currentRevision: 0,
      revisions: [],
    }
    await this.append(profile, content, signal)
    this.document.profiles.push(profile)
    this.save()
    return this.target(profile)
  }

  async update(profileId: string, signal?: AbortSignal) {
    const profile = this.requireProfile(profileId)
    const content = profile.source === 'remote'
      ? await this.download(profile.location, signal)
      : this.readLocal(profile.location)
    await this.append(profile, content, signal)
    this.save()
    return this.target(profile)
  }

  rollback(profileId: string) {
    const profile = this.requireProfile(profileId)
    const previous = profile.revisions
      .filter((item) => item.revision < profile.currentRevision)
      .sort((left, right) => right.revision - left.revision)[0]
    if (!previous) throw new Error('No previous profile revision is available')
    profile.currentRevision = previous.revision
    this.save()
    return this.target(profile)
  }

  selectRevision(profileId: string, revision: number) {
    const profile = this.requireProfile(profileId)
    if (!profile.revisions.some((item) => item.revision === revision)) {
      throw new Error(`Profile revision ${revision} was not found`)
    }
    profile.currentRevision = revision
    this.save()
    return this.target(profile)
  }

  activate(profileId?: string) {
    if (profileId) this.requireProfile(profileId)
    this.document.profiles.forEach((profile) => {
      profile.active = profile.id === profileId
    })
    this.save()
    return profileId ? this.config(profileId) : undefined
  }

  private async append(profile: StoredProfile, content: string, signal?: AbortSignal) {
    if (!content.trim()) throw new Error('Profile is empty')
    if (Buffer.byteLength(content) > maxProfileBytes) throw new Error('Profile exceeds the 8 MB limit')
    const stats = configStats(content)
    const revision = Math.max(0, ...profile.revisions.map((item) => item.revision)) + 1
    const directory = join(this.root, profile.id)
    mkdirSync(directory, { recursive: true })
    const file = `${revision}.yaml`
    const finalPath = join(directory, file)
    const temporaryPath = join(directory, `.${revision}-${randomUUID()}.tmp`)
    writeFileSync(temporaryPath, content, { mode: 0o600 })
    const homeDirectory = profile.source === 'local' ? dirname(profile.location) : directory

    try {
      await this.validate(temporaryPath, homeDirectory, signal)
      renameSync(temporaryPath, finalPath)
    } catch (error) {
      rmSync(temporaryPath, { force: true })
      throw error
    }

    profile.revisions.push({
      revision,
      file,
      createdAt: new Date().toISOString(),
      sha256: createHash('sha256').update(content).digest('hex'),
      ...stats,
    })
    profile.currentRevision = revision
  }

  private target(profile: StoredProfile): ConfigTarget {
    const revision = this.revision(profile)
    const directory = join(this.root, profile.id)
    return {
      profileId: profile.id,
      name: profile.name,
      path: join(directory, revision.file),
      homeDirectory: profile.source === 'local' ? dirname(profile.location) : directory,
      revision: revision.revision,
    }
  }

  private revision(profile: StoredProfile) {
    const revision = profile.revisions.find((item) => item.revision === profile.currentRevision)
    if (!revision) throw new Error(`Current revision for ${profile.name} is missing`)
    return revision
  }

  private requireProfile(profileId: string) {
    const profile = this.document.profiles.find((item) => item.id === profileId)
    if (!profile) throw new Error('Profile not found')
    return profile
  }

  private readLocal(path: string) {
    if (!existsSync(path)) throw new Error(`Local profile was not found: ${path}`)
    if (!['.yaml', '.yml'].includes(extname(path).toLowerCase())) {
      throw new Error('Local profile must be a .yaml or .yml file')
    }
    return readFileSync(path, 'utf8')
  }

  private remoteUrl(value: string) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error('Subscription URL is invalid')
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Subscription URL must use HTTP or HTTPS')
    }
    return url.toString()
  }

  private async download(url: string, signal?: AbortSignal) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('Subscription download timed out')), 15_000)
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await this.fetcher(url, {
        signal: controller.signal,
        headers: { Accept: 'application/yaml, text/yaml, text/plain, */*' },
        redirect: 'follow',
      })
      if (!response.ok) throw new Error(`Subscription download failed with HTTP ${response.status}`)
      const declaredSize = Number(response.headers.get('content-length'))
      if (declaredSize > maxProfileBytes) throw new Error('Profile exceeds the 8 MB limit')
      const content = await response.text()
      if (Buffer.byteLength(content) > maxProfileBytes) throw new Error('Profile exceeds the 8 MB limit')
      return content
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }

  private load(): StoreDocument {
    if (!existsSync(this.indexPath)) return { version: 1, profiles: [] }
    try {
      const document = JSON.parse(readFileSync(this.indexPath, 'utf8')) as StoreDocument
      if (document.version !== 1 || !Array.isArray(document.profiles)) throw new Error('Unsupported format')
      return document
    } catch (error) {
      throw new Error(`Unable to read profile index: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private save() {
    const temporaryPath = join(this.root, `.profiles-${randomUUID()}.tmp`)
    writeFileSync(temporaryPath, `${JSON.stringify(this.document, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporaryPath, this.indexPath)
  }
}

export type { ConfigTarget }
