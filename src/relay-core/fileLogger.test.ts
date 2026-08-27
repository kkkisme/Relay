import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileLogger } from './fileLogger'

describe('FileLogger', () => {
  const directories: string[] = []

  afterEach(() => {
    directories.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  })

  test('persists escaped log lines and rotates bounded history', () => {
    const directory = mkdtempSync(join(tmpdir(), 'relay-log-test-'))
    directories.push(directory)
    const logger = new FileLogger(directory, 1, 2)

    logger.write('info', 'first\nline')
    logger.write('warning', 'second')
    logger.write('error', 'third')

    expect(readFileSync(join(directory, 'relay-core.log.2'), 'utf8')).toContain('first\\nline')
    expect(readFileSync(join(directory, 'relay-core.log.1'), 'utf8')).toContain('second')
    expect(readFileSync(join(directory, 'relay-core.log'), 'utf8')).toContain('third')
  })
})
