import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { relayPaths } from './platformPaths'

export class FileLogger {
  private readonly path: string

  constructor(
    directory = relayPaths().logs,
    private readonly maxBytes = 5 * 1024 * 1024,
    private readonly retainedFiles = 3,
  ) {
    mkdirSync(directory, { recursive: true })
    this.path = join(directory, 'relay-core.log')
  }

  write(level: string, message: string) {
    this.rotateIfNeeded()
    appendFileSync(
      this.path,
      `${new Date().toISOString()} ${level.toUpperCase().padEnd(7)} ${message.replaceAll('\n', '\\n')}\n`,
      { mode: 0o600 },
    )
  }

  private rotateIfNeeded() {
    if (!existsSync(this.path) || statSync(this.path).size < this.maxBytes) return
    const last = `${this.path}.${this.retainedFiles}`
    rmSync(last, { force: true })
    for (let index = this.retainedFiles - 1; index >= 1; index -= 1) {
      const source = `${this.path}.${index}`
      if (existsSync(source)) renameSync(source, `${this.path}.${index + 1}`)
    }
    renameSync(this.path, `${this.path}.1`)
  }
}
