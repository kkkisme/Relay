export const helperProtocolVersion = 1
export const defaultHelperPort = 51938

export type HelperConfig = {
  version: 1
  token: string
  port: number
  allowedRoot: string
  runtimeRoot: string
  mihomoBinary: string
  mihomoSha256: string
  helperBinary: string
}

export type HelperClientConfig = Pick<HelperConfig, 'version' | 'token' | 'port'>

export type HelperStatus = {
  version: 1
  running: boolean
  pid?: number
  startedAt?: string
  exit?: { code: number | null; signal: NodeJS.Signals | null }
  logs: string[]
}

export type HelperRequest = {
  id: number
  token: string
} & (
  | { method: 'status' }
  | { method: 'start'; configPath: string }
  | { method: 'stop' }
)

export type HelperResponse = {
  id: number
  result?: HelperStatus
  error?: string
}
