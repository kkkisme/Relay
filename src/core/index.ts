import { CoreClient } from './client'
import { MockCoreTransport } from './mockTransport'
import { ProcessCoreTransport } from './processTransport'

const transport = process.env.RELAY_CORE_MODE === 'mock'
  ? new MockCoreTransport()
  : new ProcessCoreTransport()

export const coreClient = new CoreClient(transport)

export * from './types'
