import { expect, it } from 'vitest'
import { parseMockConfig, matchMockRequest } from './index'
import { QUICK_MOCK_YAML } from './quick-example'
it('provides a runnable quick-widget preset with a health response and CORS off', () => {
  const config = parseMockConfig(QUICK_MOCK_YAML)
  expect(config).toMatchObject({ port: 3100, cors: { enabled: false, origins: [] } })
  const match = matchMockRequest(config, { method: 'GET', path: '/health', headers: {}, query: {} })
  expect(match?.response).toMatchObject({ status: 200, body: { status: 'ok' } })
})
