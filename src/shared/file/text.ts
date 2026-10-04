export type LineEnding = 'lf' | 'crlf' | 'cr'

export function lineEndingCounts(text: string): { crlf: number; cr: number; lf: number } {
  const counts = { crlf: 0, cr: 0, lf: 0 }
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\r') {
      if (text[i + 1] === '\n') { counts.crlf++; i++ } else counts.cr++
    } else if (text[i] === '\n') counts.lf++
  }
  return counts
}

export function detectLineEnding(text: string): LineEnding | 'mixed' | 'none' {
  const { crlf, cr, lf } = lineEndingCounts(text)
  const kinds = [
    crlf > 0 ? 'crlf' : null,
    cr > 0 ? 'cr' : null,
    lf > 0 ? 'lf' : null
  ].filter(Boolean)
  if (kinds.length === 0) return 'none'
  if (kinds.length > 1) return 'mixed'
  return kinds[0] as LineEnding
}

export function convertLineEndings(text: string, target: LineEnding): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (target === 'lf') return normalized
  if (target === 'crlf') return normalized.replace(/\n/g, '\r\n')
  return normalized.replace(/\n/g, '\r')
}

export function countLines(text: string): number {
  if (!text) return 0
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').length
}
