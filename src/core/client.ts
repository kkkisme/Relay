import type { CoreEvent, CoreResponse } from './types'

export type CoreEventListener = (event: CoreEvent) => void

export class CoreClient {
  private requestId = 0
  private listeners = new Set<CoreEventListener>()

  async call<T>(method: string, argumentsValue?: unknown): Promise<T> {
    const id = ++this.requestId
    const response = await this.send<T>({ id, method, arguments: argumentsValue })

    if (response.error) {
      throw new Error(response.error)
    }

    return response.result as T
  }

  subscribe(listener: CoreEventListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async send<T>(_request: {
    id: number
    method: string
    arguments?: unknown
  }): Promise<CoreResponse<T>> {
    throw new Error('Core transport is not connected yet')
  }
}

export const coreClient = new CoreClient()
