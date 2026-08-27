export type CoreRequest = {
  id: number
  method: string
  arguments?: unknown
}

export type CoreResponse<T = unknown> = {
  id: number
  result?: T
  error?: string
}

export type CoreEvent<T = unknown> = {
  type: string
  data: T
}
