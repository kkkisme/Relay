import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Server } from 'bun'
import { MihomoClient } from './mihomoClient'

type Received = { method: string; path: string; authorization: string | null; body: unknown }

describe('MihomoClient', () => {
  let server: Server<undefined>
  let client: MihomoClient
  const received: Received[] = []

  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url)
        received.push({
          method: request.method,
          path: `${url.pathname}${url.search}`,
          authorization: request.headers.get('authorization'),
          body: request.body ? await request.json() : undefined,
        })

        if (url.pathname === '/version') return Response.json({ version: '1.19.30' })
        if (url.pathname === '/configs') return Response.json({ mode: 'rule' })
        if (url.pathname === '/proxies') return Response.json({ proxies: {} })
        if (url.pathname === '/connections') {
          return request.method === 'DELETE'
            ? new Response(null, { status: 204 })
            : Response.json({ uploadTotal: 10, downloadTotal: 20, connections: [] })
        }
        if (url.pathname === '/rules') return Response.json({ rules: [] })
        if (url.pathname.startsWith('/group/')) return Response.json({ 'Hong Kong': 42 })
        return new Response(null, { status: 204 })
      },
    })
    client = new MihomoClient(`http://127.0.0.1:${server.port}`, 'relay-secret')
  })

  afterAll(() => server.stop(true))

  test('reads a complete snapshot with bearer authentication', async () => {
    const snapshot = await client.snapshot()
    expect(snapshot.version.version).toBe('1.19.30')
    expect(snapshot.connections.downloadTotal).toBe(20)
    expect(received.slice(0, 5).every((entry) => entry.authorization === 'Bearer relay-secret')).toBe(true)
  })

  test('maps control operations to the documented endpoints', async () => {
    await client.selectProxy('Global Proxy', 'Hong Kong')
    await client.testGroup('Global Proxy')
    await client.closeConnection('connection/id')
    await client.closeAllConnections()
    await client.updateSettings({ mode: 'global', tun: true, allowLan: true })

    expect(received).toContainEqual(expect.objectContaining({
      method: 'PUT',
      path: '/proxies/Global%20Proxy',
      body: { name: 'Hong Kong' },
    }))
    expect(received).toContainEqual(expect.objectContaining({
      method: 'DELETE',
      path: '/connections/connection%2Fid',
    }))
    expect(received).toContainEqual(expect.objectContaining({
      method: 'PATCH',
      path: '/configs?force=true',
      body: { mode: 'global', 'allow-lan': true, tun: { enable: true } },
    }))
  })
})
