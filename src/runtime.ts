import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

// Set by the executable build, independent of its filename or install location.
declare const RELAY_COMPILED: boolean
export const compiled = typeof RELAY_COMPILED !== 'undefined' && RELAY_COMPILED

export function coreCommand(): { file: string; args: string[] } {
  // Keep support for an explicitly supplied, standalone development Core.
  if (process.env.RELAY_CORE_BINARY) return { file: process.env.RELAY_CORE_BINARY, args: [] }
  return {
    file: process.execPath,
    args: compiled ? ['--core'] : [join(import.meta.dir, 'main.tsx'), '--core'],
  }
}

export function helperExecutable(platform = process.platform) {
  if (process.env.RELAY_HELPER_BINARY) return resolve(process.env.RELAY_HELPER_BINARY)
  if (compiled) return process.execPath
  const name = platform === 'win32' ? 'relay.exe' : 'relay'
  const candidates = [join(process.cwd(), 'dist', name), join(process.cwd(), 'bin', name)]
  return candidates.find(existsSync) ?? candidates[0]!
}

export function runtimeRole(args: string[]): 'ui' | 'core' | 'helper' {
  if (args[0] === '--core') return 'core'
  if (args[0] === '--helper') return 'helper'
  if (args.length > 0) throw new Error(`Unknown Relay argument: ${args[0]}`)
  return 'ui'
}
