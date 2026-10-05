import { executeRegexJob, type RegexJob } from '@shared/regex/job'
self.onmessage = (event: MessageEvent<RegexJob>): void => {
  try { self.postMessage(executeRegexJob(event.data)) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Regex execution failed', durationMs: 0 }) }
}
