import { useEffect, useState } from 'react'

// Pass a useCallback function. Matching its identity hides stale results immediately,
// before effects run; cleanup prevents an older operation publishing over a new one.
export function useAsyncValue<T>(compute: () => Promise<T>, delay = 150): {
  value: T | undefined
  error: string | null
  pending: boolean
} {
  const [result, setResult] = useState<{
    compute: typeof compute; value?: T; error: string | null
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      Promise.resolve().then(compute).then(
        (value) => { if (!cancelled) setResult({ compute, value, error: null }) },
        (error: unknown) => {
          if (!cancelled) setResult({ compute, error: error instanceof Error ? error.message : 'Operation failed' })
        }
      )
    }, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [compute, delay])
  if (result?.compute !== compute) return { value: undefined, error: null, pending: true }
  return { value: result.value, error: result.error, pending: false }
}
