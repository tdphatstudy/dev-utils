import type { JsonValue } from '@shared/json'

export type { JsonValue }
export const MOCK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type MockMethod = typeof MOCK_METHODS[number]
export const MOCK_CONDITION_SOURCES = ['header', 'query', 'path', 'body'] as const
export const MOCK_CONDITION_OPERATORS = ['exists', 'missing', 'equals', 'notEquals', 'contains', 'gt', 'gte', 'lt', 'lte'] as const
export type MockCondition = {
  source: typeof MOCK_CONDITION_SOURCES[number]
  key: string
  operator: typeof MOCK_CONDITION_OPERATORS[number]
  value?: string | number | boolean | null
}
export type MockWhen = { all?: MockCondition[]; any?: MockCondition[] }
export type MockResponse = {
  id: string
  name: string
  when?: MockWhen
  status: number
  headers?: Record<string, string>
  body?: JsonValue
  bodyType?: 'json' | 'text'
  delayMs?: number
}
export type MockEndpoint = { id: string; name: string; method: MockMethod; path: string; responses: MockResponse[] }
export type MockConfig = {
  version: 1
  name: string
  port: number
  cors: { enabled: boolean; origins: string[] }
  endpoints: MockEndpoint[]
}
export type MockRequest = {
  method: string
  path: string
  headers: Record<string, string | string[]>
  query: Record<string, string[]>
  body?: JsonValue
}
export type MockMatch = { endpoint: MockEndpoint; response: MockResponse; params: Record<string, string> }
export type MockLog = { id: number; time: string; method: string; endpoint: string; rule: string; status: number; durationMs: number }
export type MockStatus = {
  running: boolean
  port: number | null
  baseUrl: string | null
  name: string | null
  startedAt: string | null
  requests: number
  logs: MockLog[]
}
export const MOCK_LIMITS = {
  yamlBytes: 1024 * 1024,
  responseBytes: 1024 * 1024,
  requestBytes: 1024 * 1024,
  targetLength: 8_192,
  endpoints: 100,
  responses: 20,
  conditions: 20,
  headers: 50,
  depth: 20,
  nodes: 50_000,
  delayMs: 10_000,
  logs: 100
} as const
