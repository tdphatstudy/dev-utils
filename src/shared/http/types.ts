export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type BodyMode = 'none' | 'json' | 'text' | 'form' | 'urlencoded'

export interface KeyValueRow {
  id: string
  enabled: boolean
  key: string
  value: string
}

export interface HttpRequestModel {
  method: HttpMethod
  url: string
  headers: KeyValueRow[]
  query: KeyValueRow[]
  bodyMode: BodyMode
  bodyText: string
  formRows: KeyValueRow[]
}

export interface HttpRequestPayload {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface HttpResponsePayload {
  status: number
  statusText: string
  ok: boolean
  headers: Record<string, string>
  bodyText: string
  bodyEncoding: 'utf8' | 'base64'
  size: number
  timeMs: number
  finalUrl: string
}
