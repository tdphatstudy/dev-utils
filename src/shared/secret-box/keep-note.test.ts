import { describe, expect, it } from 'vitest'
import {
  emptyKeepNote,
  keepNoteFileName,
  parseKeepNote,
  serializeKeepNote
} from './keep-note'

describe('keep-note', () => {
  it('round-trips', () => {
    const n = emptyKeepNote({ title: 'Hi', body: 'Body', color: 'mint', pinned: true })
    const raw = serializeKeepNote(n)
    const back = parseKeepNote(raw)
    expect(back.title).toBe('Hi')
    expect(back.body).toBe('Body')
    expect(back.color).toBe('mint')
    expect(back.pinned).toBe(true)
  })

  it('file name sanitizes', () => {
    expect(keepNoteFileName('Hello World!')).toBe('hello-world.keep.json')
  })
})
