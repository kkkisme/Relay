import { CoreClient } from './client'
import { MockCoreTransport } from './mockTransport'

// Swap MockCoreTransport for the named-pipe/Unix-socket transport when Relay Core lands.
export const coreClient = new CoreClient(new MockCoreTransport())

export * from './types'
