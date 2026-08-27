import { useCallback, useEffect, useState } from 'react'
import { coreClient } from '../core'
import type { RelaySettings, RelaySnapshot } from '../core'

export type RelayAction =
  | { type: 'set-running'; running: boolean }
  | { type: 'select-proxy'; groupId: string; nodeId: string }
  | { type: 'test-proxies'; groupId: string }
  | { type: 'activate-profile'; profileId: string }
  | { type: 'close-connection'; connectionId: string }
  | { type: 'close-all-connections' }
  | { type: 'update-settings'; settings: Partial<RelaySettings> }
  | { type: 'clear-logs' }

export function useRelay() {
  const [snapshot, setSnapshot] = useState<RelaySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const unsubscribe = coreClient.subscribe((event) => {
      if (active) setSnapshot(event.data)
    })

    coreClient
      .connect()
      .then(() => coreClient.call('core.snapshot', undefined))
      .then((next) => active && setSnapshot(next))
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Core unavailable'))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
      unsubscribe()
      void coreClient.disconnect()
    }
  }, [])

  const dispatch = useCallback(async (action: RelayAction) => {
    setBusy(action.type)
    setError(null)
    try {
      let next: RelaySnapshot
      switch (action.type) {
        case 'set-running':
          next = await coreClient.call('core.set-running', { running: action.running })
          break
        case 'select-proxy':
          next = await coreClient.call('proxy.select', { groupId: action.groupId, nodeId: action.nodeId })
          break
        case 'test-proxies':
          next = await coreClient.call('proxy.test', { groupId: action.groupId })
          break
        case 'activate-profile':
          next = await coreClient.call('profile.activate', { profileId: action.profileId })
          break
        case 'close-connection':
          next = await coreClient.call('connection.close', { connectionId: action.connectionId })
          break
        case 'close-all-connections':
          next = await coreClient.call('connection.close-all', undefined)
          break
        case 'update-settings':
          next = await coreClient.call('settings.update', action.settings)
          break
        case 'clear-logs':
          next = await coreClient.call('logs.clear', undefined)
          break
      }
      setSnapshot(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }, [])

  return { snapshot, loading, busy, error, dispatch }
}
