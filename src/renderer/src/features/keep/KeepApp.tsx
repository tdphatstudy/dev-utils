import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pin,
  Plus,
  Search,
  Trash2,
  StickyNote,
  LogOut,
  Palette
} from 'lucide-react'
import type { DirEntry, DocContent } from '@shared/secret-box/types'
import {
  KEEP_COLORS,
  KEEP_FOLDER,
  emptyKeepNote,
  keepNoteFileName,
  parseKeepNote,
  serializeKeepNote,
  type KeepColor,
  type KeepNote
} from '@shared/secret-box/keep-note'
import { cn } from '@renderer/lib/utils'
import { isVaultAccessError } from '@shared/secret-box/access-errors'

interface NoteCard {
  entry: DirEntry
  doc: DocContent
  note: KeepNote
}

function isNeedsAccess(e: unknown): boolean {
  return isVaultAccessError(e)
}

export default function KeepApp(): JSX.Element {
  const desktop = !!window.devutils?.privateBox
  const inventoryVersion = useRef(0)
  const defaultBoxId = useRef<string>()
  const mutating = useRef(false)
  const [saving, setSaving] = useState(false)
  const [unreadable, setUnreadable] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)
  const [keyB, setKeyB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cards, setCards] = useState<NoteCard[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<NoteCard | null>(null)
  const [draft, setDraft] = useState<KeepNote>(emptyKeepNote())
  const [creating, setCreating] = useState(false)
  const [composer, setComposer] = useState<KeepNote>(emptyKeepNote())
  const [showPalette, setShowPalette] = useState(false)

  const unlock = useCallback(async (password: string): Promise<void> => {
    if (!desktop || mutating.current || !password.trim()) return
    mutating.current = true
    setBusy(true)
    setError(null)
    try {
      const box = await window.devutils.privateBox.ensureDefault()
      defaultBoxId.current = box.id
      await window.devutils.privateBox.accessDefault(password)
      setHasAccess(true)
      setKeyB('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlock')
      setHasAccess(false)
    } finally {
      mutating.current = false
      setBusy(false)
    }
  }, [desktop])

  const bootstrap = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (!desktop) throw new Error('Keep requires the desktop app.')
      await window.devutils.privateBox.ensureDefault()
      const prep = await window.devutils.privateBox.prepareDefaultForSave()
      defaultBoxId.current = prep.boxId
      if (prep.hasAccess) {
        setHasAccess(true)
      } else {
        setHasAccess(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open Keep')
    } finally {
      setBusy(false)
      setReady(true)
    }
  }, [desktop])

  const loadNotes = useCallback(async (): Promise<void> => {
    if (!hasAccess) return
    const version = ++inventoryVersion.current
    setBusy(true)
    setError(null)
    try {
      try {
        await window.devutils.privateBox.mkdir(KEEP_FOLDER)
      } catch {
        /* exists */
      }
      const list = await window.devutils.privateBox.list(KEEP_FOLDER)
      const files = list.filter(
        (e) => e.kind === 'file' && (!e.type || e.type === 'keep-note' || e.name.endsWith('.keep.json'))
      )
      const loaded: NoteCard[] = []
      const failures: string[] = []
      for (const entry of files) {
        try {
          const doc = await window.devutils.privateBox.readFile(entry.relativePath)
          loaded.push({ entry, doc, note: parseKeepNote(doc.content) })
        } catch (e) {
          if (isNeedsAccess(e)) throw e
          failures.push(`${entry.name}: ${e instanceof Error ? e.message : 'Could not read note'}`)
        }
      }
      loaded.sort((a, b) => {
        if (a.note.pinned !== b.note.pinned) return a.note.pinned ? -1 : 1
        return (b.note.updatedAt || '').localeCompare(a.note.updatedAt || '')
      })
      if (version !== inventoryVersion.current) return
      setCards(loaded); setUnreadable(failures)
    } catch (e) {
      if (version !== inventoryVersion.current) return
      setCards([]); setUnreadable([])
      if (isNeedsAccess(e)) {
        setHasAccess(false)
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load notes')
      }
    } finally {
      if (version === inventoryVersion.current) setBusy(false)
    }
  }, [hasAccess])

  useEffect(() => {
    void bootstrap()
    return () => {
      inventoryVersion.current++
      void window.devutils?.privateBox?.clearAccess()
    }
  }, [bootstrap])

  useEffect(() => {
    if (hasAccess) void loadNotes()
  }, [hasAccess, loadNotes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) =>
        c.note.title.toLowerCase().includes(q) || c.note.body.toLowerCase().includes(q)
    )
  }, [cards, query])

  const pinned = filtered.filter((c) => c.note.pinned)
  const others = filtered.filter((c) => !c.note.pinned)

  const saveCard = async (card: NoteCard, note: KeepNote): Promise<boolean> => {
    if (mutating.current) return false
    mutating.current = true; setSaving(true); setError(null)
    try {
      const next = { ...note, updatedAt: new Date().toISOString() }
      await window.devutils.privateBox.writeFile(card.doc.relativePath, serializeKeepNote(next, card.doc.content))
      await loadNotes()
      return true
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Could not save note'}. Draft kept in memory; retry before closing Keep.`)
      return false
    } finally { mutating.current = false; setSaving(false) }
  }

  const createNote = async (note: KeepNote): Promise<void> => {
    if (mutating.current) return
    if (!note.title.trim() && !note.body.trim()) {
      setCreating(false)
      setComposer(emptyKeepNote())
      return
    }
    mutating.current = true; setSaving(true); setError(null)
    try {
      const now = new Date().toISOString()
      const payload = serializeKeepNote({
        ...note,
        createdAt: now,
        updatedAt: now
      })
      await window.devutils.privateBox.saveDocument({
        boxId: defaultBoxId.current,
        name: keepNoteFileName(note.title || 'note'),
        type: 'keep-note',
        content: payload,
        relativeDir: KEEP_FOLDER
      })
      setCreating(false)
      setComposer(emptyKeepNote())
      await loadNotes()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create note')
    } finally {
      mutating.current = false; setSaving(false)
    }
  }

  const deleteCard = async (card: NoteCard): Promise<void> => {
    if (mutating.current || !window.confirm('Permanently delete this note? This cannot be undone.')) return
    mutating.current = true; setSaving(true); setError(null)
    try {
      await window.devutils.privateBox.remove(card.doc.relativePath)
      setEditing(null)
      await loadNotes()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally { mutating.current = false; setSaving(false) }
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-[#202124] text-[13px] text-white/50">
        Loading Keep…
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center overflow-auto bg-[#202124] px-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#2d2e30] p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fbbc04]/20 text-[#fbbc04]">
              <StickyNote className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold text-white">Keep</h1>
              <p className="text-[12px] text-white/50">Encrypted notes · Default Secret Box</p>
            </div>
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-white/60">
            Notes are sealed in your local Default Secret Box. Device key is automatic; enter your
            password (key B) to open.
          </p>
          <input
            type="password"
            aria-label="Keep password"
            disabled={!desktop || busy}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[#fbbc04]/50"
            placeholder="Password (key B)"
            value={keyB}
            onChange={(e) => setKeyB(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy && keyB.trim()) void unlock(keyB)
            }}
            autoFocus
            autoComplete="off"
          />
          {error && <p role="alert" className="mt-2 break-words text-[12px] text-red-400">{error}</p>}
          <button
            type="button"
            disabled={!desktop || busy || !keyB.trim()}
            className="mt-4 w-full rounded-lg bg-[#fbbc04] py-2.5 text-[13px] font-semibold text-[#202124] disabled:opacity-40"
            onClick={() => void unlock(keyB)}
          >
            {busy ? 'Unlocking…' : 'Open Keep'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#202124] text-[#e8eaed]">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <StickyNote className="h-5 w-5 text-[#fbbc04]" />
        <span className="text-[16px] font-medium">Keep</span>
        <div className="relative ml-4 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            className="w-full rounded-lg border border-transparent bg-[#525355]/40 py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-white/40 focus:border-white/10 focus:bg-[#525355]/60"
            placeholder="Search notes"
            aria-label="Search notes by title or body"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="rounded-lg px-2 py-1.5 text-[12px] text-white/60 hover:bg-white/10 hover:text-white"
          title="Sign out of box"
          aria-label="Sign out of box"
          disabled={busy || saving}
          onClick={() => {
            void window.devutils.privateBox.clearAccess()
            inventoryVersion.current++
            setHasAccess(false)
            setCards([]); setUnreadable([]); setEditing(null); setDraft(emptyKeepNote())
            setCreating(false); setComposer(emptyKeepNote()); setKeyB('')
          }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-6">
        {!creating ? (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setComposer(emptyKeepNote())
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-[#2d2e30] px-4 py-3 text-left text-[14px] text-white/50 shadow-lg hover:bg-[#35363a]"
          >
            <Plus className="h-4 w-4" />
            Take a note…
          </button>
        ) : (
          <NoteEditor
            note={composer}
            onChange={setComposer}
            onClose={() => {
              void createNote(composer)
            }}
            submitLabel="Save note"
            busy={saving}
            showPalette={showPalette}
            setShowPalette={setShowPalette}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-6">
        {error && (
          <p role="alert" className="mx-auto mb-4 max-w-3xl text-center text-[12px] text-red-400">{error}</p>
        )}
        {busy && cards.length === 0 && (
          <p className="text-center text-[13px] text-white/40">Loading…</p>
        )}
        {unreadable.length > 0 && <details className="mx-auto mb-4 max-w-3xl rounded-lg border border-red-400/30 p-3 text-[12px] text-red-300">
          <summary>{unreadable.length} note(s) could not be read. Files were kept.</summary>
          <ul className="mt-2 space-y-1">{unreadable.map((issue) => <li key={issue} className="break-words">{issue}</li>)}</ul>
        </details>}
        {!busy && !error && !unreadable.length && filtered.length === 0 && (
          <p className="text-center text-[13px] text-white/40">
            {query ? 'No matching notes' : 'No notes yet — take one above'}
          </p>
        )}

        {pinned.length > 0 && (
          <Section title="Pinned">
            <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
              {pinned.map((c) => (
                <KeepCard
                  key={c.doc.relativePath}
                  card={c}
                  onOpen={() => {
                    setEditing(c)
                    setDraft({ ...c.note })
                    setShowPalette(false)
                  }}
                />
              ))}
            </div>
          </Section>
        )}

        {others.length > 0 && (
          <Section title={pinned.length ? 'Others' : undefined}>
            <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
              {others.map((c) => (
                <KeepCard
                  key={c.doc.relativePath}
                  card={c}
                  onOpen={() => {
                    setEditing(c)
                    setDraft({ ...c.note })
                    setShowPalette(false)
                  }}
                />
              ))}
            </div>
          </Section>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-[2px]">
          <div role="dialog" aria-label="Edit note" className="w-full max-w-lg">
            {error && <p role="alert" className="mb-3 rounded-lg bg-[#2d2e30] p-3 text-[12px] text-red-300">{error}</p>}
            <NoteEditor
              note={draft}
              onChange={setDraft}
              onClose={() => {
                void (async () => {
                  if (await saveCard(editing, draft)) setEditing(null)
                })()
              }}
              onDelete={() => void deleteCard(editing)}
              submitLabel="Save changes"
              busy={saving}
              showPalette={showPalette}
              setShowPalette={setShowPalette}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  children
}: {
  title?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="mx-auto mb-8 max-w-6xl">
      {title && (
        <h2 className="mb-3 px-1 text-[11px] font-medium uppercase tracking-wider text-white/40">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

function KeepCard({ card, onOpen }: { card: NoteCard; onOpen: () => void }): JSX.Element {
  const bg = colorBg(card.note.color)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'mb-3 w-full break-inside-avoid rounded-xl border border-white/10 p-3.5 text-left transition hover:border-white/25',
        bg
      )}
    >
      <div className="flex items-start gap-2">
        {card.note.title && (
          <div className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-white">
            {card.note.title}
          </div>
        )}
        {card.note.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-white/50" />}
      </div>
      {card.note.body && (
        <p
          className={cn(
            'whitespace-pre-wrap text-[13px] leading-relaxed text-white/80',
            card.note.title && 'mt-1.5'
          )}
        >
          {card.note.body.length > 280 ? `${card.note.body.slice(0, 280)}…` : card.note.body}
        </p>
      )}
      {!card.note.title && !card.note.body && (
        <p className="text-[13px] italic text-white/35">Empty note</p>
      )}
    </button>
  )
}

function NoteEditor({
  note,
  onChange,
  onClose,
  onDelete,
  submitLabel,
  showPalette,
  setShowPalette,
  busy = false
}: {
  note: KeepNote
  onChange: (n: KeepNote) => void
  onClose: () => void
  onDelete?: () => void
  submitLabel: string
  showPalette: boolean
  setShowPalette: (v: boolean) => void
  busy?: boolean
}): JSX.Element {
  const bg = colorBg(note.color)
  return (
    <div className={cn('rounded-xl border border-white/15 shadow-2xl', bg)}>
      <input
        className="w-full bg-transparent px-4 pt-3 text-[16px] font-medium text-white outline-none placeholder:text-white/35"
        placeholder="Title"
        aria-label="Note title"
        disabled={busy}
        value={note.title}
        onChange={(e) => onChange({ ...note, title: e.target.value })}
      />
      <textarea
        className="min-h-[120px] w-full resize-none bg-transparent px-4 py-2 text-[14px] leading-relaxed text-white/90 outline-none placeholder:text-white/35"
        placeholder="Take a note…"
        aria-label="Note body"
        disabled={busy}
        value={note.body}
        onChange={(e) => onChange({ ...note, body: e.target.value })}
        autoFocus
      />
      <div className="relative flex items-center gap-1 border-t border-white/10 px-2 py-2">
        <button
          type="button"
          className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"
          title="Pin"
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          disabled={busy}
          aria-pressed={note.pinned}
          onClick={() => onChange({ ...note, pinned: !note.pinned })}
        >
          <Pin className={cn('h-4 w-4', note.pinned && 'fill-current text-[#fbbc04]')} />
        </button>
        <button
          type="button"
          className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"
          title="Background"
          aria-label="Choose note background"
          aria-expanded={showPalette}
          disabled={busy}
          onClick={() => setShowPalette(!showPalette)}
        >
          <Palette className="h-4 w-4" />
        </button>
        {onDelete && (
          <button
            type="button"
            className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-red-300"
            title="Delete"
            aria-label="Permanently delete note"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="ml-auto rounded-lg px-3 py-1.5 text-[13px] font-medium text-white/80 hover:bg-white/10"
          onClick={onClose}
          disabled={busy}
        >
          {busy ? 'Saving…' : submitLabel}
        </button>

        {showPalette && (
          <div className="absolute bottom-12 left-2 flex flex-wrap gap-1.5 rounded-xl border border-white/15 bg-[#2d2e30] p-2 shadow-xl">
            {KEEP_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                aria-label={`${c.label} background`}
                aria-pressed={note.color === c.id}
                disabled={busy}
                className={cn(
                  'h-7 w-7 rounded-full border-2',
                  note.color === c.id ? 'border-white' : 'border-transparent'
                )}
                style={{ background: c.swatch }}
                onClick={() => {
                  onChange({ ...note, color: c.id })
                  setShowPalette(false)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function colorBg(color: KeepColor): string {
  const map: Record<KeepColor, string> = {
    default: 'bg-[#2d2e30]',
    coral: 'bg-[#77172e]',
    peach: 'bg-[#692b17]',
    sand: 'bg-[#7c4a03]',
    mint: 'bg-[#0c625d]',
    sage: 'bg-[#256141]',
    fog: 'bg-[#284255]',
    dusk: 'bg-[#472e5b]',
    blossom: 'bg-[#6c394f]',
    clay: 'bg-[#4b443a]'
  }
  return map[color] ?? map.default
}
