import { describe, expect, test } from 'bun:test'
import { coreCommand, runtimeRole } from './runtime'

describe('unified runtime entry', () => {
  test('dispatches headless roles only from the first argument', () => {
    expect(runtimeRole([])).toBe('ui')
    expect(runtimeRole(['--core', '--socket', 'path with spaces'])).toBe('core')
    expect(runtimeRole(['--helper', '--daemon', '--config', 'path with spaces'])).toBe('helper')
    expect(() => runtimeRole(['--install'])).toThrow('Unknown Relay argument')
    expect(() => runtimeRole(['unknown', '--helper'])).toThrow('Unknown Relay argument')
  })

  test('source development launches Core with Bun and the unified entry', () => {
    const previous = process.env.RELAY_CORE_BINARY
    delete process.env.RELAY_CORE_BINARY
    try {
      const command = coreCommand()
      expect(command.file).toBe(process.execPath)
      expect(command.args[0]).toEndWith('main.tsx')
      expect(command.args[1]).toBe('--core')
      process.env.RELAY_CORE_BINARY = '/custom/core'
      expect(coreCommand()).toEqual({ file: '/custom/core', args: [] })
    } finally {
      if (previous === undefined) delete process.env.RELAY_CORE_BINARY
      else process.env.RELAY_CORE_BINARY = previous
    }
  })
})
