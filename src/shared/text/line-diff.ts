export type LineDiffKind = 'equal' | 'add' | 'remove'

export interface LineDiffPair {
  left: { line: number | null; text: string; kind: LineDiffKind } | null
  right: { line: number | null; text: string; kind: LineDiffKind } | null
}

export interface LineDiffResult {
  pairs: LineDiffPair[]
  added: number
  removed: number
  unchanged: number
}

/**
 * Side-by-side line diff via LCS.
 * left/right line numbers are 1-based when present.
 */
export function diffLines(leftText: string, rightText: string): LineDiffResult {
  const left = splitLines(leftText)
  const right = splitLines(rightText)
  const n = left.length
  const m = right.length

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (left[i] === right[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }

  type Op =
    | { type: 'equal'; li: number; ri: number }
    | { type: 'remove'; li: number }
    | { type: 'add'; ri: number }

  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      ops.push({ type: 'equal', li: i, ri: j })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: 'remove', li: i })
      i++
    } else {
      ops.push({ type: 'add', ri: j })
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'remove', li: i })
    i++
  }
  while (j < m) {
    ops.push({ type: 'add', ri: j })
    j++
  }

  const pairs: LineDiffPair[] = []
  let added = 0
  let removed = 0
  let unchanged = 0
  let k = 0
  while (k < ops.length) {
    const op = ops[k]!
    if (op.type === 'equal') {
      pairs.push({
        left: { line: op.li + 1, text: left[op.li]!, kind: 'equal' },
        right: { line: op.ri + 1, text: right[op.ri]!, kind: 'equal' }
      })
      unchanged++
      k++
      continue
    }
    if (op.type === 'remove' && ops[k + 1]?.type === 'add') {
      const rem = op
      const add = ops[k + 1] as { type: 'add'; ri: number }
      pairs.push({
        left: { line: rem.li + 1, text: left[rem.li]!, kind: 'remove' },
        right: { line: add.ri + 1, text: right[add.ri]!, kind: 'add' }
      })
      removed++
      added++
      k += 2
      continue
    }
    if (op.type === 'remove') {
      pairs.push({
        left: { line: op.li + 1, text: left[op.li]!, kind: 'remove' },
        right: null
      })
      removed++
      k++
      continue
    }
    pairs.push({
      left: null,
      right: { line: op.ri + 1, text: right[op.ri]!, kind: 'add' }
    })
    added++
    k++
  }

  return { pairs, added, removed, unchanged }
}

function splitLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}
