import { describe, expect, test } from 'bun:test'
import { TunPermissionInspector } from './tunPermissions'

describe('TunPermissionInspector', () => {
  test('reports the macOS privilege boundary', async () => {
    const granted = await new TunPermissionInspector('darwin', async () => '', () => 0).inspect()
    const required = await new TunPermissionInspector('darwin', async () => '', () => 501).inspect()

    expect(granted.permission).toBe('granted')
    expect(required.permission).toBe('required')
  })

  test('checks Windows administrator membership', async () => {
    const granted = await new TunPermissionInspector('win32', async () => 'True', undefined).inspect()
    const required = await new TunPermissionInspector('win32', async () => 'False', undefined).inspect()

    expect(granted.permission).toBe('granted')
    expect(required.permission).toBe('required')
  })

  test('reports unsupported operating systems', async () => {
    const status = await new TunPermissionInspector('aix', async () => '', undefined).inspect()
    expect(status).toEqual(expect.objectContaining({ supported: false, permission: 'unavailable' }))
  })
})
