import type { CoreEventListener, CoreTransport } from './transport'
import type { CoreMethod, CoreMethodMap } from './types'

export class CoreClient {
  private requestId = 0

  constructor(private readonly transport: CoreTransport) {}

  connect() {
    return this.transport.connect()
  }

  disconnect() {
    return this.transport.disconnect()
  }

  subscribe(listener: CoreEventListener) {
    return this.transport.subscribe(listener)
  }

  async call<K extends CoreMethod>(
    method: K,
    argumentsValue: CoreMethodMap[K]['arguments'],
  ): Promise<CoreMethodMap[K]['result']> {
    const response = await this.transport.request({
      id: ++this.requestId,
      method,
      arguments: argumentsValue,
    })

    if (response.error) throw new Error(response.error)
    if (!response.result) throw new Error(`Core method ${method} returned no result`)
    return response.result
  }
}
