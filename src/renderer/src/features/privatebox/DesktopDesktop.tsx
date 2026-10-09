import { t as uiText, useI18n as useUiLocale } from '@renderer/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  FileText,
  Film,
  Home,
  Image as ImageIcon,
  LogOut,
  Music,
  File,
  Save,
  X
} from 'lucide-react'
import type { DirEntry, DocContent, DocType, VaultStatus } from '@shared/secret-box/types'
import { isBinaryKind } from '@shared/secret-box/content-kinds'
import { NameDialog } from './NameDialog'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { TypeFileEditor } from './editors/TypeFileEditor'
import { cn } from '@renderer/lib/utils'
import { isVaultAccessError } from '@shared/secret-box/access-errors'
import { useVaultDraftRecovery } from '@renderer/hooks/useVaultDraftRecovery'
import { useShortcutSet } from '@renderer/shortcuts/useShortcuts'
import { useUnsavedChanges } from '@renderer/hooks/useUnsavedChanges'

type NamePrompt =
  | { kind: 'file'; type: DocType; initial: string }
  | { kind: 'folder'; initial: string }
  | { kind: 'rename'; initial: string; entry: DirEntry }

interface Props {
  status: VaultStatus
  onSignOut: () => void | Promise<void>
  onCreateNew: () => void | Promise<void>
  onRefresh: () => void
}

function isNeedsAccess(e: unknown): boolean {
  return isVaultAccessError(e)
}

/** Classic macOS Finder folder (yellow tab + body, soft shadow). */
function MacFolderGlyph({ className }: { className?: string }): JSX.Element {
  useUiLocale()
  // Unique gradient ids per instance (many folders on desktop)
  const uid = useMemo(() => Math.random().toString(36).slice(2, 9), [])
  return (
    <svg
      className={className}
      width={56}
      height={48}
      viewBox="0 0 64 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={`mf-tab-${uid}`} x1="8" y1="6" x2="28" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE9A0" />
          <stop offset="1" stopColor="#F5C84A" />
        </linearGradient>
        <linearGradient id={`mf-body-${uid}`} x1="32" y1="16" x2="32" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD56A" />
          <stop offset="0.55" stopColor="#F0B83A" />
          <stop offset="1" stopColor="#E0A628" />
        </linearGradient>
        <linearGradient id={`mf-shine-${uid}`} x1="32" y1="18" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF6D0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFF6D0" stopOpacity="0" />
        </linearGradient>
        <filter id={`mf-shadow-${uid}`} x="-10%" y="-5%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#000" floodOpacity="0.18" />
        </filter>
      </defs>
      {/* Soft ground shadow */}
      <ellipse cx="32" cy="50" rx="22" ry="2.2" fill="#000" opacity="0.08" />
      {/* Tab (back flap) */}
      <path
        d="M6 18c0-3.314 2.686-6 6-6h11.2c1.7 0 3.3.8 4.3 2.1l2.1 2.7c1 1.3 2.6 2.1 4.3 2.1H52c3.314 0 6 2.686 6 6v2H6v-8.9z"
        fill={`url(#mf-tab-${uid})`}
      />
      {/* Body */}
      <path
        d="M4 20c0-2.21 1.79-4 4-4h48c2.21 0 4 1.79 4 4v24c0 3.314-2.686 6-6 6H10c-3.314 0-6-2.686-6-6V20z"
        fill={`url(#mf-body-${uid})`}
        filter={`url(#mf-shadow-${uid})`}
      />
      {/* Top shine */}
      <path
        d="M8 18h48c1.1 0 2 .9 2 2v8c0 0-8 4-26 4S6 28 6 28v-8c0-1.1.9-2 2-2z"
        fill={`url(#mf-shine-${uid})`}
      />
      {/* Subtle bottom rim */}
      <path
        d="M6 42c0 2.2 1.8 4 4 4h44c2.2 0 4-1.8 4-4"
        stroke="#C99220"
        strokeOpacity="0.35"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  )
}

function FileGlyph({ entry }: { entry: DirEntry }): JSX.Element {
  useUiLocale()
  if (entry.kind === 'dir') {
    return <MacFolderGlyph />
  }
  if (entry.type === 'json') {
    return (
      <div className="relative flex h-12 w-11 flex-col overflow-hidden rounded-[6px] border border-black/10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-mac-raised">
        <div className="flex h-3.5 items-center gap-0.5 border-b border-black/5 bg-gradient-to-b from-[#5ac8fa] to-[#007aff] px-1">
          <span className="h-1 w-1 rounded-full bg-white/80" />
          <span className="h-1 w-1 rounded-full bg-white/50" />
        </div>
        <div className="flex flex-1 items-center justify-center font-mono text-[11px] font-bold text-[#007aff]">
          {'{ }'}
        </div>
        <div className="absolute -right-0.5 -top-0.5 rounded bg-[#007aff] px-0.5 text-[7px] font-bold uppercase tracking-wide text-white shadow-sm">
          {uiText('json')}</div>
      </div>
    )
  }
  if (entry.type === 'markdown') {
    return (
      <div className="relative flex h-12 w-11 flex-col overflow-hidden rounded-[6px] border border-black/10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-mac-raised">
        <div className="h-2 bg-gradient-to-r from-[#30d158] to-[#34c759]" />
        <div className="flex flex-1 flex-col justify-center gap-[3px] px-1.5">
          <div className="h-[3px] rounded-full bg-mac-label/20" />
          <div className="h-[3px] w-[85%] rounded-full bg-mac-label/12" />
          <div className="h-[3px] w-[70%] rounded-full bg-mac-label/12" />
          <div className="h-[3px] w-[78%] rounded-full bg-mac-label/10" />
        </div>
        <div className="absolute -right-0.5 -top-0.5 rounded bg-[#34c759] px-0.5 text-[7px] font-bold uppercase tracking-wide text-white shadow-sm">
          md
        </div>
      </div>
    )
  }
  if (entry.type === 'image') {
    return (
      <div className="relative flex h-12 w-11 flex-col items-center justify-center overflow-hidden rounded-[6px] border border-black/10 bg-gradient-to-br from-[#ff9f0a]/20 to-[#ff375f]/15 shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
        <ImageIcon className="h-6 w-6 text-[#ff9f0a]" strokeWidth={1.5} />
        <div className="absolute -right-0.5 -top-0.5 rounded bg-[#ff9f0a] px-0.5 text-[7px] font-bold uppercase text-white">
          {uiText('img')}</div>
      </div>
    )
  }
  if (entry.type === 'video') {
    return (
      <div className="relative flex h-12 w-11 flex-col items-center justify-center overflow-hidden rounded-[6px] border border-black/10 bg-gradient-to-br from-[#bf5af2]/25 to-[#5e5ce6]/20 shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
        <Film className="h-6 w-6 text-[#bf5af2]" strokeWidth={1.5} />
        <div className="absolute -right-0.5 -top-0.5 rounded bg-[#bf5af2] px-0.5 text-[7px] font-bold uppercase text-white">
          {uiText('vid')}</div>
      </div>
    )
  }
  if (entry.type === 'audio') {
    return (
      <div className="relative flex h-12 w-11 flex-col items-center justify-center overflow-hidden rounded-[6px] border border-black/10 bg-gradient-to-br from-[#30d158]/20 to-[#64d2ff]/15 shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
        <Music className="h-6 w-6 text-[#30d158]" strokeWidth={1.5} />
        <div className="absolute -right-0.5 -top-0.5 rounded bg-[#30d158] px-0.5 text-[7px] font-bold uppercase text-white">
          {uiText('aud')}</div>
      </div>
    )
  }
  if (entry.type === 'binary') {
    return (
      <div className="relative flex h-12 w-11 flex-col items-center justify-center overflow-hidden rounded-[6px] border border-black/10 bg-mac-control shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
        <File className="h-6 w-6 text-mac-label-secondary" strokeWidth={1.5} />
        <div className="absolute -right-0.5 -top-0.5 rounded bg-mac-label-tertiary px-0.5 text-[7px] font-bold uppercase text-white">{uiText('file')}{' '}</div>
      </div>
    )
  }
  return (
    <div className="relative flex h-12 w-11 flex-col overflow-hidden rounded-[6px] border border-black/10 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-mac-raised">
      <div className="h-2 bg-gradient-to-b from-mac-label-tertiary/50 to-mac-label-tertiary/30" />
      <div className="flex flex-1 items-center justify-center">
        <FileText className="h-5 w-5 text-mac-label-secondary" strokeWidth={1.4} />
      </div>
      <div className="absolute -right-0.5 -top-0.5 rounded bg-mac-label-secondary px-0.5 text-[7px] font-bold uppercase tracking-wide text-white shadow-sm">
        txt
      </div>
    </div>
  )
}

export function DesktopDesktop({ status, onSignOut, onCreateNew, onRefresh }: Props): JSX.Element {
  const shortcuts = useShortcutSet()
  useUiLocale()
  const sessionId = status.sessionId ?? ''
  const listVersion = useRef(0)
  const openVersion = useRef(0)
  const saving = useRef(false)
  const mutating = useRef(false)
  const desktopRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const activeName = status.vaults.find((v) => v.id === status.activeId)?.name ?? 'Private Box'
  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [doc, setDoc] = useState<DocContent | null>(null)
  const [draft, setDraft] = useState('')
  const draftRef = useRef(draft)
  draftRef.current = draft
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; target: DirEntry | null; opener: HTMLElement } | null>(null)
  const recoveryDialog = useVaultDraftRecovery(sessionId, 'document', () =>
    doc && !isBinaryKind(doc.type) && draftRef.current !== doc.content
      ? { kind: 'document', path: doc.relativePath, content: draftRef.current } : null,
    async (checkpoint, restoredSession) => {
      if (!checkpoint.path) throw new Error('Draft document path is missing.')
      const version = openVersion.current
      const file = await window.devutils.privateBox.readFile(checkpoint.path, restoredSession)
      if (version !== openVersion.current) throw new Error('View changed during recovery.')
      if (isBinaryKind(file.type) || file.encoding === 'base64') throw new Error('This document is not editable text.')
      setCwd(file.relativePath.split('/').slice(0, -1).join('/'))
      setDoc(file); setDraft(checkpoint.content); draftRef.current = checkpoint.content
      setSelectedId(file.id); setDirty(checkpoint.content !== file.content)
    })

  const crumbs = useMemo(() => (cwd ? cwd.split('/').filter(Boolean) : []), [cwd])
  const selected = entries.find((e) => e.id === selectedId) ?? null
  const { requestLeave, dialog: leaveDialog } = useUnsavedChanges({ dirty, busy, onSave: () => save() })
  const affectsDocument = (entry: DirEntry): boolean => Boolean(doc && (doc.relativePath === entry.relativePath || entry.kind === 'dir' && doc.relativePath.startsWith(entry.relativePath + '/')))
  const clearEditor = (): void => {
    openVersion.current++
    setDoc(null)
    setDraft('')
    draftRef.current = ''
    setDirty(false)
  }

  const loadList = useCallback(async (): Promise<void> => {
    if (cwd !== cwdRef.current) return
    const version = ++listVersion.current
    setError(null)
    try {
      const list = await window.devutils.privateBox.list(cwd, sessionId)
      if (version !== listVersion.current) return
      setEntries(list)
    } catch (e) {
      if (version !== listVersion.current) return
      setEntries([])
      if (isNeedsAccess(e)) onSignOut()
      else setError(e instanceof Error ? e.message : 'Failed to list')
    }
  }, [cwd, onSignOut, sessionId])

  useEffect(() => {
    void loadList()
    return () => { listVersion.current++; openVersion.current++ }
  }, [loadList])

  useEffect(() => {
    setCwd('')
    setEntries([])
    setSelectedId(null)
    setDoc(null)
    setDraft('')
    setDirty(false)
  }, [status.activeId])

  const openEntry = (entry: DirEntry): void => {
    if (entry.kind === 'file' && doc?.relativePath === entry.relativePath) {
      const editor = editorRef.current
      const focusTarget = editor?.querySelector<HTMLElement>('.cm-content') ?? editor?.querySelector<HTMLElement>('audio, video, button')
      focusTarget?.focus()
      return
    }
    requestLeave(async () => {
      if (entry.kind === 'dir') {
        clearEditor()
        setSelectedId(null)
        setCwd(entry.relativePath)
        return
      }
      const version = ++openVersion.current
      setBusy(true)
      setError(null)
      try {
        const file = await window.devutils.privateBox.readFile(entry.relativePath, sessionId)
        if (version !== openVersion.current) return
        setDoc(file)
        setDraft(file.content)
        draftRef.current = file.content
        setDirty(false)
        setSelectedId(entry.id)
      } catch (e) {
        if (version !== openVersion.current) return
        if (isNeedsAccess(e)) await onSignOut()
        else setError(e instanceof Error ? e.message : 'Open failed')
      } finally {
        if (version === openVersion.current) setBusy(false)
      }
    })
  }

  const save = async (): Promise<boolean> => {
    if (!doc || saving.current || mutating.current) return false
    if (isBinaryKind(doc.type) || doc.encoding === 'base64') {
      setError('Media files are view-only — use Export or re-import to replace')
      return false
    }
    saving.current = true
    const version = openVersion.current
    setBusy(true)
    setError(null)
    try {
      const content = draftRef.current
      if (doc.type === 'json') JSON.parse(content)
      const next = await window.devutils.privateBox.writeFile(doc.relativePath, content, doc.sessionId)
      if (version !== openVersion.current) return false
      setDoc(next)
      setDirty(draftRef.current !== next.content)
      await loadList()
      return version === openVersion.current && draftRef.current === next.content
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const exportCurrent = async (): Promise<void> => {
    if (!doc || saving.current || mutating.current) return
    mutating.current = true
    setBusy(true)
    setError(null)
    try {
      await window.devutils.privateBox.exportToDisk(doc.relativePath, doc.sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      mutating.current = false
      setBusy(false)
    }
  }

  const handleNameConfirm = async (name: string): Promise<void> => {
    const promptState = namePrompt
    setNamePrompt(null)
    if (!promptState || saving.current || mutating.current) return
    mutating.current = true
    const version = openVersion.current
    const originalDraft = draftRef.current
    setBusy(true)
    setError(null)
    try {
      if (promptState.kind === 'file') {
        const file = await window.devutils.privateBox.createFile(cwd, name, promptState.type, sessionId)
        await loadList()
        if (version !== openVersion.current) return
        if (draftRef.current !== originalDraft) { setError('File created. Your current document changed during creation and remains open.'); return }
        setDoc(file)
        setDraft(file.content)
        draftRef.current = file.content
        setDirty(false)
        setSelectedId(file.id)
      } else if (promptState.kind === 'folder') {
        const rel = cwd ? `${cwd}/${name}` : name
        await window.devutils.privateBox.mkdir(rel, sessionId)
        await loadList()
      } else {
        const updated = await window.devutils.privateBox.rename(
          promptState.entry.relativePath,
          name,
          sessionId
        )
        if (doc && affectsDocument(promptState.entry)) {
          const relativePath = updated.relativePath + doc.relativePath.slice(promptState.entry.relativePath.length)
          const renamed = { ...doc, relativePath, ...(updated.kind === 'file' ? { name: updated.name } : {}) }
          setDoc(renamed)
          const file = await window.devutils.privateBox.readFile(relativePath, sessionId)
          if (version !== openVersion.current) return
          setDoc(file)
          setDirty(draftRef.current !== file.content)
          setSelectedId(updated.id)
        }
        await loadList()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      mutating.current = false
      setBusy(false)
    }
  }

  const removeEntry = (entry: DirEntry): void => {
    const remove = async (): Promise<void> => {
      if (saving.current || mutating.current || !window.confirm(uiText('Delete “{name}”?', { name: entry.name }))) return
      mutating.current = true
      setBusy(true)
      try {
        await window.devutils.privateBox.remove(entry.relativePath, sessionId)
        if (affectsDocument(entry)) clearEditor()
        setSelectedId(null)
        await loadList()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed')
      } finally {
        mutating.current = false
        setBusy(false)
      }
    }
    if (affectsDocument(entry)) requestLeave(remove)
    else void remove()
  }

  const goTo = (path: string): void => {
    requestLeave(() => {
      clearEditor()
      setSelectedId(null)
      setCwd(path)
    })
  }

  const closeEditor = (): void => {
    requestLeave(clearEditor)
  }

  const startCreateFile = (type: DocType): void => {
    requestLeave(() => setNamePrompt({
      kind: 'file',
      type,
      initial: type === 'json' ? 'document.json' : type === 'markdown' ? 'notes.md' : 'notes.txt'
    }))
  }

  // Global shortcuts while desktop is focused
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || namePrompt || menu || busy || saving.current || document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const t = e.target as HTMLElement | null
      if (t && !desktopRef.current?.contains(t)) return
      const typing =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable ||
          t.closest('.cm-editor'))

      if (shortcuts.matches('vault.save', e)) {
        if (doc) {
          e.preventDefault()
          void save()
        }
        return
      }

      if (typing && !e.metaKey && !e.ctrlKey && !e.altKey) return

      if (shortcuts.matches('vault.new-text', e)) {
        e.preventDefault()
        startCreateFile('text')
        return
      }
      if (shortcuts.matches('vault.new-folder', e)) {
        e.preventDefault()
        setNamePrompt({ kind: 'folder', initial: 'New Folder' })
        return
      }
      if (shortcuts.matches('vault.new-json', e)) {
        e.preventDefault()
        startCreateFile('json')
        return
      }
      if (shortcuts.matches('vault.rename', e) && selected && !typing) {
        e.preventDefault()
        setNamePrompt({ kind: 'rename', initial: selected.name, entry: selected })
        return
      }
      if (shortcuts.matches('vault.delete', e) && selected && !typing) {
        e.preventDefault()
        void removeEntry(selected)
        return
      }
      if (shortcuts.matches('vault.open', e) && selected && !typing) {
        e.preventDefault()
        void openEntry(selected)
        return
      }
      if (e.key === 'Escape') {
        if (doc) closeEditor()
        else setSelectedId(null)
        setMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, dirty, selected, namePrompt, menu, busy, draft, cwd, shortcuts])

  const emptyMenuItems: ContextMenuItem[] = [
    { id: 'new-text', label: uiText('New Text File'), shortcut: shortcuts.label('vault.new-text') },
    { id: 'new-md', label: uiText('New Markdown') },
    { id: 'new-json', label: uiText('New JSON'), shortcut: shortcuts.label('vault.new-json') },
    { id: 'sep1', label: '', separator: true },
    { id: 'new-folder', label: uiText('New Folder'), shortcut: shortcuts.label('vault.new-folder') },
    { id: 'import', label: uiText('Import file / media…') },
    { id: 'sep2', label: '', separator: true },
    { id: 'refresh', label: uiText('Refresh') }
  ]

  const itemMenuItems = (entry: DirEntry): ContextMenuItem[] => [
    { id: 'open', label: uiText('Open'), shortcut: shortcuts.label('vault.open') },
    ...(entry.kind === 'file'
      ? [{ id: 'export', label: uiText('Export saved file…') } as ContextMenuItem]
      : []),
    { id: 'sep1', label: '', separator: true },
    { id: 'rename', label: uiText('Rename'), shortcut: shortcuts.label('vault.rename') },
    { id: 'delete', label: uiText('Delete'), shortcut: shortcuts.label('vault.delete'), danger: true },
    { id: 'sep2', label: '', separator: true },
    { id: 'new-text', label: uiText('New Text File') },
    { id: 'new-json', label: uiText('New JSON') },
    { id: 'import', label: uiText('Import file / media…') },
    { id: 'new-folder', label: uiText('New Folder') }
  ]

  const onMenuSelect = (id: string): void => {
    const target = menu?.target
    if (id === 'new-text') startCreateFile('text')
    else if (id === 'new-md') startCreateFile('markdown')
    else if (id === 'new-json') startCreateFile('json')
    else if (id === 'new-folder') setNamePrompt({ kind: 'folder', initial: 'New Folder' })
    else if (id === 'refresh') void loadList()
    else if (id === 'open' && target) void openEntry(target)
    else if (id === 'rename' && target)
      setNamePrompt({ kind: 'rename', initial: target.name, entry: target })
    else if (id === 'delete' && target) void removeEntry(target)
    else if (id === 'export' && target && target.kind === 'file') {
      void (async () => {
        if (saving.current || mutating.current) return
        mutating.current = true
        setBusy(true)
        try {
          const path = await window.devutils.privateBox.exportToDisk(target.relativePath, sessionId)
          if (path) setError(null)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Export failed')
        } finally { mutating.current = false; setBusy(false) }
      })()
    } else if (id === 'import') {
      void (async () => {
        if (saving.current || mutating.current) return
        mutating.current = true
        setBusy(true)
        try {
          const dir =
            target?.kind === 'dir' ? target.relativePath : cwd
          const result = await window.devutils.privateBox.importFromDisk(dir, sessionId)
          if (result) await loadList()
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Import failed')
        } finally { mutating.current = false; setBusy(false) }
      })()
    }
  }

  return (
    <div ref={desktopRef} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-mac-bg">
      {recoveryDialog}
      {leaveDialog}
      <NameDialog
        open={!!namePrompt}
        title={
          namePrompt?.kind === 'folder'
            ? uiText('New folder')
            : namePrompt?.kind === 'rename'
              ? uiText('Rename')
              : namePrompt?.kind === 'file'
                ? uiText('New {type} file', { type: namePrompt.type })
                : ''
        }
        initialValue={namePrompt?.initial ?? ''}
        confirmLabel={namePrompt?.kind === 'rename' ? uiText('Rename') : uiText('Create')}
        onCancel={() => setNamePrompt(null)}
        onConfirm={(v) => void handleNameConfirm(v)}
      />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          opener={menu.opener}
          label={menu.target ? uiText('Actions for {name}', { name: menu.target.name }) : uiText('Folder actions')}
          items={menu.target ? itemMenuItems(menu.target) : emptyMenuItems}
          onSelect={onMenuSelect}
          onClose={() => setMenu(null)}
        />
      )}

      {/* Finder chrome */}
      <header className="flex shrink-0 items-center gap-3 border-b border-mac-separator bg-mac-sidebar/90 px-3 py-2 backdrop-blur-xl">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-mac-accent to-[#5e5ce6] text-[13px] font-semibold text-white shadow-sm">
          {(activeName[0] || 'P').toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight">{activeName}</div>
          <div className="truncate font-mono text-[10px] text-mac-label-tertiary" title={status.rootPath ?? ''}>
            {status.rootPath}
          </div>
        </div>
        <button type="button" className="mac-btn-ghost !text-[12px]" disabled={busy} onClick={() => requestLeave(onCreateNew)}>
          {uiText('New box')}
        </button>
        <button
          type="button"
          className="mac-btn-secondary !text-[12px]"
          disabled={busy}
          onClick={() => requestLeave(onSignOut)}
        >
          <LogOut className="h-3.5 w-3.5" />
          {uiText('Sign out')}
        </button>
      </header>

      {/* macOS-style path bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-mac-separator bg-mac-surface/70 px-2 py-1.5">
        <button type="button" className="mac-btn-ghost !px-2 !py-1" onClick={() => goTo('')} title={uiText('Home')}>
          <Home className="h-3.5 w-3.5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-mac bg-mac-control/60 px-1 py-0.5 text-[12px]">
          <button type="button" className="mac-btn-ghost !px-1.5 !py-0.5 shrink-0" onClick={() => goTo('')}>{uiText('Desktop')}{' '}</button>
          {crumbs.map((c, i) => (
            <span key={`${c}-${i}`} className="flex shrink-0 items-center gap-0.5">
              <ChevronRight className="h-3 w-3 text-mac-label-tertiary" />
              <button
                type="button"
                className="mac-btn-ghost !px-1.5 !py-0.5"
                onClick={() => goTo(crumbs.slice(0, i + 1).join('/'))}
              >
                {c}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Icon desktop */}
      <div
        className="relative min-h-0 flex-1 overflow-auto bg-gradient-to-b from-mac-bg via-mac-bg to-mac-surface/40 p-5"
        role="group"
        aria-label={uiText('Private Box files')}
        tabIndex={0}
        onClick={() => {
          setSelectedId(null)
          setMenu(null)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.currentTarget.focus({ preventScroll: true })
          setMenu({ x: e.clientX, y: e.clientY, target: null, opener: e.currentTarget })
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return
          e.preventDefault()
          e.stopPropagation()
          const bounds = e.currentTarget.getBoundingClientRect()
          setMenu({ x: bounds.left + 16, y: bounds.top + 16, target: null, opener: e.currentTarget })
        }}
      >
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-[13px] text-mac-label-tertiary">
            <div className="mb-3 opacity-45">
              <MacFolderGlyph />
            </div>
            <p className="font-medium text-mac-label-secondary">{uiText('This folder is empty')}</p>
            <p className="mt-1 text-[11px]">{uiText('Right-click for New File / New Folder')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] content-start gap-3">
            {entries.map((entry) => {
              const isSel = selectedId === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={entry.name}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-mac-xl px-2 py-3 text-center transition-all',
                    isSel
                      ? 'bg-mac-accent/15 ring-1 ring-mac-accent/35'
                      : 'hover:bg-mac-control/50'
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedId(entry.id)
                    setMenu(null)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    void openEntry(entry)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedId(entry.id)
                    e.currentTarget.focus({ preventScroll: true })
                    setMenu({ x: e.clientX, y: e.clientY, target: entry, opener: e.currentTarget })
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedId(entry.id)
                    const bounds = e.currentTarget.getBoundingClientRect()
                    setMenu({ x: bounds.left, y: bounds.bottom, target: entry, opener: e.currentTarget })
                  }}
                >
                  <FileGlyph entry={entry} />
                  <span
                    className={cn(
                      'line-clamp-2 w-full break-words rounded px-1 text-[11px] font-medium leading-snug',
                      isSel ? 'bg-mac-accent-fill text-white' : 'text-mac-label'
                    )}
                  >
                    {entry.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Type-aware editor window (mac traffic lights) */}
      {doc && (
        <div ref={editorRef} className="absolute inset-x-3 bottom-3 top-24 z-30 flex flex-col overflow-hidden rounded-mac-xl border border-mac-separator bg-mac-surface shadow-mac-lg sm:inset-x-8 sm:bottom-5 sm:top-20">
          <div className="flex shrink-0 items-center gap-3 border-b border-mac-separator bg-mac-sidebar/90 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="h-3 w-3 rounded-full bg-[#ff5f57] hover:brightness-110"
                title={uiText('Close')}
                onClick={closeEditor}
              />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-[12px] font-semibold">
                {doc.name}
                {dirty ? <span className="text-mac-warning"> •</span> : null}
              </div>
              <div className="text-[10px] text-mac-label-tertiary">
                {doc.type === 'markdown' && uiText('Notion blocks · type / · Enter new block') + (shortcuts.label('vault.save') ? ' · ' + shortcuts.label('vault.save') : '')}
                {doc.type === 'json' && uiText('Format · Minify · Tree') + (shortcuts.label('vault.save') ? ' · ' + shortcuts.label('vault.save') : '')}
                {doc.type === 'text' && uiText('Plain text · LF/CRLF') + (shortcuts.label('vault.save') ? ' · ' + shortcuts.label('vault.save') : '')}
                {doc.type === 'image' && uiText('Image preview · encrypted · Export to save out')}
                {doc.type === 'video' && uiText('Video player · encrypted · Export to save out')}
                {doc.type === 'audio' && uiText('Audio player · encrypted · Export to save out')}
                {doc.type === 'binary' && uiText('Binary file · encrypted · Export to open elsewhere')}
                {doc.type === 'keep-note' && uiText('Keep note')}
              </div>
            </div>
            {isBinaryKind(doc.type) || doc.encoding === 'base64' ? (
              <button
                type="button"
                className="mac-btn-secondary !text-[12px]"
                disabled={busy}
                onClick={() => void exportCurrent()}
              >{uiText('Export…')}{' '}</button>
            ) : (
              <button
                type="button"
                className="mac-btn-primary !text-[12px]"
                disabled={!dirty || busy}
                onClick={() => void save()}
              >
                <Save className="h-3.5 w-3.5" />
                {uiText('Save')}</button>
            )}
            <button type="button" className="mac-btn-ghost !p-1.5" onClick={closeEditor} title={uiText('Close')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <TypeFileEditor
              type={doc.type}
              value={draft}
              name={doc.name}
              mimeType={doc.mimeType}
              onExport={() => void exportCurrent()}
              onChange={(v) => {
                if (isBinaryKind(doc.type)) return
                draftRef.current = v
                setDraft(v)
                setDirty(v !== doc.content)
              }}
            />
          </div>
        </div>
      )}

      {(error || busy) && (
        <footer className="shrink-0 border-t border-mac-separator px-3 py-1.5 text-[12px]">
          {error ? (
            <span role="alert" className="text-mac-danger">{uiText(error)}</span>
          ) : (
            <span className="text-mac-label-tertiary">{uiText('Working…')}</span>
          )}
        </footer>
      )}
    </div>
  )
}
