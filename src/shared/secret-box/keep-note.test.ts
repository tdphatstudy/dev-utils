import { describe, expect, it } from 'vitest'
import {
  emptyKeepNote,
  keepNoteFileName,
  parseKeepNote,
  serializeKeepNote
} from './keep-note'

describe('keep-note', () => {
  it('retains unrecognized JSON and malformed note fields as original text rather than an empty note', () => {
    for (const raw of ['42', 'null', '["original"]', '{}', '{"body":42}', '{"body":"text","pinned":"false"}', '{broken', ' plain text ']) {
      expect(parseKeepNote(raw).body).toBe(raw)
    }
    expect(parseKeepNote('{"body":"legacy body"}').body).toBe('legacy body')
  })
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

  it('edits and pins without changing unknown fields, large numbers, duplicate members or nested note fields', () => {
    const extra = '"future": {"body":"nested", "id":900719925474099312345, "scale":1e400, "escaped":"\\u0061", "dup":1,"dup":2}, "__proto__":{"safe":true}'
    const raw = `{\r\n  "body":"before", ${extra}\r\n}\r\n`
    const note = parseKeepNote(raw)
    const saved = serializeKeepNote({ ...note, body: 'edited\n"text"', pinned: true }, raw)
    expect(saved).toContain(extra)
    expect(saved.endsWith('}\r\n')).toBe(true)
    expect(parseKeepNote(saved)).toMatchObject({ body: 'edited\n"text"', pinned: true })
    const editedAgain = serializeKeepNote({ ...parseKeepNote(saved), color: 'mint' }, saved)
    expect(editedAgain).toContain(extra)
    expect(parseKeepNote(editedAgain).color).toBe('mint')
    expect(({} as Record<string, unknown>).safe).toBeUndefined()
  })

  it('patches escaped and repeated owned keys without altering nested values', () => {
    const raw = '{"\\u0062ody":"old", "body":"last", "title":"old", "color":"default", "pinned":false, "createdAt":"start", "updatedAt":"old", "tags":[{"body":"nested"},"},:"]}'
    const saved = serializeKeepNote({ ...parseKeepNote(raw), body: 'new', title: 'New', updatedAt: 'now' }, raw)
    expect(saved).toContain('"\\u0062ody":"new", "body":"new"')
    expect(saved).toContain('"tags":[{"body":"nested"},"},:"]')
    expect(parseKeepNote(saved)).toMatchObject({ title: 'New', body: 'new', createdAt: 'start', updatedAt: 'now' })
  })

  it('preserves unsupported owned field formats as original text through an edit/save', () => {
    for (const raw of ['{"body":"original","color":"future-color"}', '{"body":"original","createdAt":42}', '{"body":"original","updatedAt":false}']) {
      const note = parseKeepNote(raw)
      expect(note.body).toBe(raw)
      const saved = serializeKeepNote({ ...note, title: 'Recovered text' }, raw)
      expect(parseKeepNote(saved).body).toBe(raw)
    }
  })
})
