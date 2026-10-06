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
import { Modal } from '@renderer/components/ui/Modal'
import { useUnsavedChanges } from '@renderer/hooks/useUnsavedChanges'
import './KeepApp.css'

interface NoteCard {
  entry: DirEntry
  doc: DocContent
  note: KeepNote
}

interface DeleteTarget {
  card: NoteCard
  boxId: string | undefined
  sessionId: string
  inventoryVersion: number
}

function cardFor(doc: DocContent): NoteCard {
  return { doc, note: parseKeepNote(doc.content), entry: { id: doc.id, name: doc.name, kind: 'file', type: doc.type, relativePath: doc.relativePath, updatedAt: doc.updatedAt } }
}
function sortedCards(cards: NoteCard[]): NoteCard[] {
  return cards.slice().sort((a, b) => a.note.pinned !== b.note.pinned ? (a.note.pinned ? -1 : 1) : (b.note.updatedAt || '').localeCompare(a.note.updatedAt || ''))
}

function isNeedsAccess(e: unknown): boolean {
  return isVaultAccessError(e)
}

export default function KeepApp(): JSX.Element {
  const desktop = !!window.devutils?.privateBox
  const inventoryVersion = useRef(0)
  const mounted = useRef(false)
  const addNoteButton = useRef<HTMLButtonElement>(null)
  const focusAfterDelete = useRef<DeleteTarget | null>(null)
  const defaultBoxId = useRef<string>()
  const sessionId = useRef('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
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
  const editingIdentity = useRef<NoteCard | null>(null)
  editingIdentity.current = editing
  const [draft, setDraft] = useState<KeepNote>(emptyKeepNote())
  const [creating, setCreating] = useState(false)
  const [composer, setComposer] = useState<KeepNote>(emptyKeepNote())
  const [showPalette, setShowPalette] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const editorDirty = !!editing && (draft.title !== editing.note.title || draft.body !== editing.note.body || draft.color !== editing.note.color || draft.pinned !== editing.note.pinned)
  const composerDirty = creating && Boolean(composer.title || composer.body)
  const { requestLeave, dialog: leaveDialog } = useUnsavedChanges({
    dirty: editorDirty || composerDirty,
    busy: saving || signingOut,
    onSave: async () => {
      if (editing && editorDirty && !await saveCard(editing, draft)) return false
      if (creating && composerDirty && !await createNote(composer)) return false
      return true
    }
  })

  const openNote = (card: NoteCard): void => requestLeave(() => {
    setCreating(false)
    setComposer(emptyKeepNote())
    setEditing(card)
    setDraft({ ...card.note })
    setShowPalette(false)
  })

  const closeEditor = (): void => requestLeave(() => {
    setEditing(null)
    setDraft(emptyKeepNote())
    setShowPalette(false)
  })

  const signOut = async (): Promise<void> => {
    setSigningOut(true)
    try {
      await window.devutils.privateBox.clearAccess()
      inventoryVersion.current++
      sessionId.current = ''; setNextCursor(null)
      setHasAccess(false)
      setCards([]); setUnreadable([]); setEditing(null); setDraft(emptyKeepNote())
      setCreating(false); setComposer(emptyKeepNote()); setKeyB('')
      setDeleteTarget(null); setDeleteError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign out. Try again.')
      throw e
    } finally { setSigningOut(false) }
  }

  const unlock = useCallback(async (password: string): Promise<void> => {
    if (!desktop || mutating.current || !password.trim()) return
    mutating.current = true
    setBusy(true)
    setError(null)
    try {
      const box = await window.devutils.privateBox.ensureDefault()
      defaultBoxId.current = box.id
      sessionId.current = await window.devutils.privateBox.accessDefault(password)
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
      sessionId.current = prep.sessionId ?? ''
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

  const loadNotes = useCallback(async (cursor?: string): Promise<void> => {
    if (!hasAccess) return
    const version = ++inventoryVersion.current
    setBusy(true)
    setError(null)
    try {
      try {
        await window.devutils.privateBox.mkdir(KEEP_FOLDER, sessionId.current)
      } catch {
        /* exists */
      }
      const page = await window.devutils.privateBox.listKeepNotes(sessionId.current, cursor)
      const loaded = page.notes.map(cardFor)
      if (version !== inventoryVersion.current) return
      setCards((previous) => sortedCards(cursor ? [...previous.filter((card) => !loaded.some((next) => next.doc.id === card.doc.id)), ...loaded] : loaded))
      setUnreadable((previous) => cursor ? [...previous, ...page.unreadable] : page.unreadable)
      setNextCursor(page.nextCursor)
    } catch (e) {
      if (version !== inventoryVersion.current) return
      if (!cursor) { setCards([]); setUnreadable([]) }
      if (isNeedsAccess(e)) {
        setCards([]); setUnreadable([]); sessionId.current = ''
        setHasAccess(false)
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load notes')
      }
    } finally {
      if (version === inventoryVersion.current) setBusy(false)
    }
  }, [hasAccess])

  useEffect(() => {
    mounted.current = true
    void bootstrap()
    return () => {
      mounted.current = false
      inventoryVersion.current++
      sessionId.current = ''
      void window.devutils?.privateBox?.clearAccess()
    }
  }, [bootstrap])

  useEffect(() => {
    if (hasAccess) void loadNotes()
  }, [hasAccess, loadNotes])

  useEffect(() => {
    if (deleteTarget || !focusAfterDelete.current) return
    const target = focusAfterDelete.current
    focusAfterDelete.current = null
    const frame = requestAnimationFrame(() => {
      if (mounted.current && sessionId.current === target.sessionId &&
          defaultBoxId.current === target.boxId && inventoryVersion.current === target.inventoryVersion &&
          !document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        addNoteButton.current?.focus()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [deleteTarget])

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
      const doc = await window.devutils.privateBox.writeFile(card.doc.relativePath, serializeKeepNote(next, card.doc.content), card.doc.sessionId)
      const updated = cardFor(doc)
      setCards((previous) => sortedCards(previous.map((item) => item.doc.id === doc.id ? updated : item)))
      setEditing((previous) => previous?.doc.id === doc.id ? updated : previous)
      return true
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Could not save note'}. Draft kept in memory; retry before closing Keep.`)
      return false
    } finally { mutating.current = false; setSaving(false) }
  }

  const createNote = async (note: KeepNote): Promise<boolean> => {
    if (mutating.current) return false
    if (!note.title.trim() && !note.body.trim()) {
      setCreating(false)
      setComposer(emptyKeepNote())
      return true
    }
    mutating.current = true; setSaving(true); setError(null)
    try {
      const now = new Date().toISOString()
      const payload = serializeKeepNote({
        ...note,
        createdAt: now,
        updatedAt: now
      })
      const saved = await window.devutils.privateBox.saveDocument({
        boxId: defaultBoxId.current,
        name: keepNoteFileName(note.title || 'note'),
        type: 'keep-note',
        content: payload,
        relativeDir: KEEP_FOLDER
      }, sessionId.current)
      setCreating(false)
      setComposer(emptyKeepNote())
      setCards((previous) => sortedCards([...previous, cardFor(saved.doc)]))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create note')
      return false
    } finally {
      mutating.current = false; setSaving(false)
    }
  }

  const requestDelete = (card: NoteCard): void => {
    if (mutating.current) return
    setShowPalette(false)
    setDeleteError(null)
    setDeleteTarget({ card, boxId: defaultBoxId.current, sessionId: sessionId.current, inventoryVersion: inventoryVersion.current })
  }

  const cancelDelete = (): void => {
    if (mutating.current) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  const deleteCard = async (): Promise<void> => {
    const target = deleteTarget
    if (!target || mutating.current) return
    const isCurrent = (): boolean => mounted.current && sessionId.current === target.sessionId &&
      defaultBoxId.current === target.boxId && inventoryVersion.current === target.inventoryVersion
    const matches = (card: NoteCard): boolean => card.doc.id === target.card.doc.id &&
      card.doc.relativePath === target.card.doc.relativePath && card.doc.sessionId === target.sessionId
    if (!isCurrent() || target.card.doc.sessionId !== target.sessionId || !cards.some(matches)) {
      setDeleteError('This note or box session changed. Cancel and reopen the note before deleting.')
      return
    }
    mutating.current = true
    setSaving(true)
    setDeleteError(null)
    try {
      // The bridge and main service also validate the captured session around IO.
      await window.devutils.privateBox.remove(target.card.doc.relativePath, target.sessionId)
      if (!isCurrent()) return
      setCards(previous => previous.filter(card => !matches(card)))
      if (editingIdentity.current && matches(editingIdentity.current)) {
        setEditing(null)
        setDraft(emptyKeepNote())
      }
      focusAfterDelete.current = target
      setDeleteTarget(null)
      setDeleteError(null)
      setError(null)
    } catch (e) {
      if (isCurrent()) setDeleteError(`${e instanceof Error ? e.message : 'Could not delete note'}. Deletion could not be confirmed. Your draft is still here. Try again or cancel.`)
    } finally {
      mutating.current = false
      if (mounted.current) setSaving(false)
    }
  }

  if (!ready) {
    return (
      <div role="status" aria-live="polite" className="flex h-full items-center justify-center bg-mac-bg text-[13px] text-mac-label-secondary">
        Loading Keep…
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex h-full flex-col items-center overflow-auto bg-mac-bg px-6 py-6">
        <div className="my-auto w-full max-w-sm shrink-0 rounded-2xl border border-mac-separator bg-mac-surface p-6 shadow-mac-lg">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mac-accent-soft text-mac-accent">
              <StickyNote className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold text-mac-label">Keep</h1>
              <p className="text-[12px] text-mac-label-secondary">Encrypted notes · Default Secret Box</p>
            </div>
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-mac-label-secondary">
            Notes are sealed in your local Default Secret Box. Device key is automatic; enter your
            password (key B) to open.
          </p>
          <input
            type="password"
            aria-label="Keep password"
            disabled={!desktop || busy}
            className="mac-input w-full font-mono"
            placeholder="Password (key B)"
            value={keyB}
            onChange={(e) => setKeyB(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy && keyB.trim()) void unlock(keyB)
            }}
            autoFocus
            autoComplete="off"
          />
          {error && <p role="alert" className="mt-2 break-words text-[12px] text-mac-danger">{error}</p>}
          <button
            type="button"
            disabled={!desktop || busy || !keyB.trim()}
            className="mac-btn-primary mt-4 w-full"
            onClick={() => void unlock(keyB)}
          >
            {busy ? 'Unlocking…' : 'Open Keep'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="keep-app flex h-full min-h-0 flex-col bg-mac-bg text-mac-label">
      <header className="flex shrink-0 items-center gap-3 border-b border-mac-separator px-4 py-3">
        <StickyNote className="h-5 w-5 text-mac-accent" />
        <span className="text-[16px] font-medium">Keep</span>
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mac-label-tertiary" />
          <input
            className="mac-input w-full !pl-9"
            placeholder="Search notes"
            aria-label="Search notes by title or body"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="mac-btn-ghost !h-9 !w-9 !p-0"
          title="Sign out of box"
          aria-label="Sign out of box"
          disabled={busy || saving || signingOut}
          onClick={() => requestLeave(signOut)}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        {!creating ? (
          <button
            ref={addNoteButton}
            type="button"
            onClick={() => {
              setCreating(true)
              setComposer(emptyKeepNote())
            }}
            className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-mac-separator bg-mac-surface px-4 py-3 text-left text-[14px] text-mac-label-secondary shadow-mac hover:bg-mac-control-hover"
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
            onCancel={() => requestLeave(() => { setCreating(false); setComposer(emptyKeepNote()); setShowPalette(false) })}
            busy={saving}
            showPalette={showPalette}
            setShowPalette={setShowPalette}
          />
        )}
      </div>

      <div className="px-4 py-6">
        {error && (
          <p role="alert" className="mx-auto mb-4 max-w-3xl text-center text-[12px] text-mac-danger">{error}</p>
        )}
        {busy && cards.length === 0 && (
          <p role="status" aria-live="polite" className="text-center text-[13px] text-mac-label-secondary">Loading notes…</p>
        )}
        {unreadable.length > 0 && <details className="mx-auto mb-4 max-w-3xl rounded-lg border border-mac-danger/40 p-3 text-[12px] text-mac-danger">
          <summary>{unreadable.length} note(s) could not be read. Files were kept.</summary>
          <ul className="mt-2 space-y-1">{unreadable.map((issue) => <li key={issue} className="break-words">{issue}</li>)}</ul>
        </details>}
        {!busy && !error && !unreadable.length && filtered.length === 0 && (
          <p className="text-center text-[13px] text-mac-label-tertiary">
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
                  onOpen={() => openNote(c)}
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
                  onOpen={() => openNote(c)}
                />
              ))}
            </div>
          </Section>
        )}
        {nextCursor && <div className="mx-auto max-w-3xl text-center">
          <p role="status" className="mb-2 text-[12px] text-mac-label-secondary">{cards.length} notes loaded. Load more to search the remaining notes.</p>
          <button type="button" disabled={busy || saving} className="rounded-lg border border-mac-separator px-4 py-2 text-[13px] disabled:opacity-40" onClick={() => void loadNotes(nextCursor)}>{busy ? 'Loading…' : 'Load more notes'}</button>
        </div>}
      </div>

      </div>

      {editing && (
        <Modal open title="Edit note" description="Changes are saved only when you choose Save changes." onClose={closeEditor} busy={saving}>
            {error && <p role="alert" className="mb-3 rounded-lg bg-mac-surface p-3 text-[12px] text-mac-danger">{error}</p>}
            <NoteEditor
              note={draft}
              onChange={setDraft}
              onClose={() => {
                void (async () => {
                  if (await saveCard(editing, draft)) setEditing(null)
                })()
              }}
              onDelete={() => requestDelete(editing)}
              submitLabel="Save changes"
              onCancel={closeEditor}
              busy={saving}
              showPalette={showPalette}
              setShowPalette={setShowPalette}
            />
        </Modal>
      )}
      {deleteTarget && (
        <Modal open title="Delete note?" description="This permanently deletes the saved note and discards its unsaved changes. This cannot be undone." onClose={cancelDelete} busy={saving}>
          <p className="mb-4 break-words rounded-lg border border-mac-separator bg-mac-control p-3 text-[14px] font-medium text-mac-label">
            {deleteTarget.card.note.title.trim().slice(0, 120) || 'Untitled note'}{deleteTarget.card.note.title.trim().length > 120 ? '…' : ''}
          </p>
          {deleteError && <p role="alert" className="mb-4 text-[13px] leading-relaxed text-mac-danger">{deleteError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="mac-btn-secondary" disabled={saving} onClick={cancelDelete}>Cancel</button>
            <button type="button" className="mac-btn-primary" style={{ backgroundColor: 'var(--mac-danger-fill)' }} disabled={saving} onClick={() => void deleteCard()}>{saving ? 'Deleting…' : 'Delete note'}</button>
          </div>
        </Modal>
      )}
      {leaveDialog}
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
        <h2 className="mb-3 px-1 text-[12px] font-medium uppercase tracking-wider text-mac-label-secondary">
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
        'mb-3 w-full break-inside-avoid rounded-xl border border-mac-separator p-3.5 text-left transition hover:border-mac-accent/40',
        bg
      )}
    >
      <div className="flex items-start gap-2">
        {card.note.title && (
          <div className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-mac-label break-words">
            {card.note.title}
          </div>
        )}
        {card.note.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-mac-label-secondary" />}
      </div>
      {card.note.body && (
        <p
          className={cn(
            'whitespace-pre-wrap break-words text-[13px] leading-relaxed text-mac-label-secondary',
            card.note.title && 'mt-1.5'
          )}
        >
          {card.note.body.length > 280 ? `${card.note.body.slice(0, 280)}…` : card.note.body}
        </p>
      )}
      {!card.note.title && !card.note.body && (
        <p className="text-[13px] italic text-mac-label-tertiary">Empty note</p>
      )}
    </button>
  )
}

function NoteEditor({
  note,
  onChange,
  onClose,
  onDelete,
  onCancel,
  submitLabel,
  showPalette,
  setShowPalette,
  busy = false
}: {
  note: KeepNote
  onChange: (n: KeepNote) => void
  onClose: () => void
  onDelete?: () => void
  onCancel: () => void
  submitLabel: string
  showPalette: boolean
  setShowPalette: (v: boolean) => void
  busy?: boolean
}): JSX.Element {
  const bg = colorBg(note.color)
  return (
    <div className={cn('keep-editor rounded-xl border border-mac-separator shadow-mac', bg)}>
      <input
        className="w-full bg-transparent px-4 pt-3 text-[16px] font-medium text-mac-label outline-none placeholder:text-mac-label-tertiary"
        placeholder="Title"
        aria-label="Note title"
        disabled={busy}
        value={note.title}
        onChange={(e) => onChange({ ...note, title: e.target.value })}
      />
      <textarea
        className="min-h-[120px] w-full resize-none bg-transparent px-4 py-2 text-[14px] leading-relaxed text-mac-label outline-none placeholder:text-mac-label-tertiary"
        placeholder="Take a note…"
        aria-label="Note body"
        disabled={busy}
        value={note.body}
        onChange={(e) => onChange({ ...note, body: e.target.value })}
        autoFocus
      />
      <div className="relative flex flex-wrap items-center gap-1 border-t border-mac-separator px-2 py-2">
        <button
          type="button"
          className="mac-btn-ghost !h-9 !w-9 !p-0"
          title="Pin"
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          disabled={busy}
          aria-pressed={note.pinned}
          onClick={() => onChange({ ...note, pinned: !note.pinned })}
        >
          <Pin className={cn('h-4 w-4', note.pinned && 'fill-current text-mac-accent')} />
        </button>
        <button
          type="button"
          className="mac-btn-ghost !h-9 !w-9 !p-0"
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
            className="mac-btn-ghost !h-9 !w-9 !p-0 hover:!text-mac-danger"
            title="Delete"
            aria-label="Permanently delete note"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button type="button" className="mac-btn-secondary ml-auto" disabled={busy} onClick={onCancel}>Close</button>
        <button
          type="button"
          className="mac-btn-primary"
          onClick={onClose}
          disabled={busy}
        >
          {busy ? 'Saving…' : submitLabel}
        </button>

        {showPalette && (
          <div className="absolute bottom-12 left-2 right-2 flex flex-wrap gap-1.5 rounded-xl border border-mac-separator bg-mac-raised p-2 shadow-mac-lg">
            {KEEP_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                aria-label={`${c.label} background`}
                aria-pressed={note.color === c.id}
                disabled={busy}
                className={cn(
                  'h-8 w-8 rounded-full border-2', colorBg(c.id),
                  note.color === c.id ? 'border-mac-label ring-2 ring-mac-accent' : 'border-mac-separator'
                )}
                data-note-color={c.id}
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
  return `keep-note-${color}`
}
