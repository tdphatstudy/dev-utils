import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query. Defaults to `false` until mounted
 * (desktop-first; avoids SSR/hydration mismatch).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = (): void => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Viewport width < 768px (Tailwind `md` threshold). */
export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 767.98px)')
}

/** Viewport width < 1024px (Tailwind `lg` threshold). */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023.98px)')
}
