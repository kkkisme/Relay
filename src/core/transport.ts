import type { CoreEvent, CoreMethod, CoreMethodMap, CoreRequest, CoreResponse } from './types'

export type CoreEventListener = (event: CoreEvent) => void

export interface CoreTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  request<K extends CoreMethod>(
    request: CoreRequest<K>,
  ): Promise<CoreResponse<CoreMethodMap[K]['result']>>
  subscribe(listener: CoreEventListener): () => void
}
