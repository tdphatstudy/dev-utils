import { formatSql, minifySql, validateSql } from '@shared/sql'
import type { SqlJob } from '@shared/sql/job'

self.onmessage = (event: MessageEvent<SqlJob>): void => {
  const { kind, input, options } = event.data
  const result = kind === 'validate' ? validateSql(input, options) : kind === 'minify' ? minifySql(input, options) : formatSql(input, options)
  self.postMessage(kind === 'validate' && result.ok ? { ...result, text: '' } : result)
}
