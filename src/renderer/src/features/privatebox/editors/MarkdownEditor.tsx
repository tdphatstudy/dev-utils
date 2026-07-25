import { useEffect, useMemo, useRef, useState } from 'react'
import {
  emptyBlock,
  emptyDoc,
  filterSlash,
  parseDoc,
  serializeDoc,
  type BlockType,
  type NotionBlock,
  type NotionDoc
} from './notionBlocks'
import { cn } from '@renderer/lib/utils'

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Strip a slash command prefix like `/h1` or `/heading 1` from block text. */
function stripSlashPrefix(text: string): string {
  // Full-line slash query: "/h1", "/todo", "/heading1"
  if (/^\/[^\n]*$/.test(text)) return ''
  // Slash only at start with trailing content after space: shouldn't happen for filter
  return text.replace(/^\/[^\s]*\s?/, '')
}

export function MarkdownEditor({ value, onChange, className }: Props): JSX.Element {
  const [doc, setDoc] = useState<NotionDoc>(() => parseDoc(value))
  const seedRef = useRef(value)
  const [slash, setSlash] = useState<{
    blockId: string
    query: string
    index: number
  } | null>(null)

  // Reload when opening a different file payload
  useEffect(() => {
    if (value === seedRef.current) return
    if (value !== serializeDoc(doc)) {
      setDoc(parseDoc(value))
      seedRef.current = value
      setSlash(null)
    }
  }, [value, doc])

  const emit = (next: NotionDoc): void => {
    setDoc(next)
    const raw = serializeDoc(next)
    seedRef.current = raw
    onChange(raw)
  }

  const updateBlock = (id: string, patch: Partial<NotionBlock>): void => {
    emit({
      notion: 1,
      blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))
    })
  }

  const focusBlock = (id: string, atEnd = false): void => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
      if (!el) return
      el.focus()
      if (atEnd || el.innerText.length > 0) {
        const range = document.createRange()
        const sel = window.getSelection()
        range.selectNodeContents(el)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    })
  }

  /**
   * Notion-style "turn into": change block type and wipe `/h1` (etc.) from both
   * React state and the live contentEditable DOM. Leaving the slash text is the
   * main bug — focused contentEditables skip React→DOM sync unless forced.
   */
  const setType = (id: string, type: BlockType): void => {
    const source = doc.blocks.find((b) => b.id === id)
    // Slash menu only opens when the whole line is `/query`, so residual is ''.
    const residual = source ? stripSlashPrefix(source.text) : ''

    emit({
      notion: 1,
      blocks: doc.blocks.map((b) => {
        if (b.id !== id) return b
        return {
          ...b,
          type,
          text: type === 'divider' ? '' : residual,
          checked: type === 'todo' ? (b.checked ?? false) : undefined
        }
      })
    })
    setSlash(null)

    // Force DOM clear immediately (do not wait for React commit)
    const elNow = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
    if (elNow && type !== 'divider') {
      elNow.innerText = residual
    }

    if (type !== 'divider') {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
        if (!el) return
        if (el.innerText.replace(/\n$/, '') !== residual) {
          el.innerText = residual
        }
        el.focus()
        const range = document.createRange()
        const sel = window.getSelection()
        range.selectNodeContents(el)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      })
    }
  }

  const insertAfter = (id: string, type: BlockType = 'p'): string => {
    const idx = doc.blocks.findIndex((b) => b.id === id)
    const nb = emptyBlock(type)
    const blocks = [...doc.blocks]
    blocks.splice(idx + 1, 0, nb)
    emit({ notion: 1, blocks })
    return nb.id
  }

  const removeBlock = (id: string): void => {
    if (doc.blocks.length <= 1) {
      emit(emptyDoc())
      return
    }
    const idx = doc.blocks.findIndex((b) => b.id === id)
    const blocks = doc.blocks.filter((b) => b.id !== id)
    emit({ notion: 1, blocks })
    const prev = blocks[Math.max(0, idx - 1)]
    if (prev && prev.type !== 'divider') focusBlock(prev.id, true)
  }

  /** Focus last empty block, or append one — never duplicate empty lines. */
  const ensureEmptyBlock = (): void => {
    const last = doc.blocks[doc.blocks.length - 1]
    if (last && last.type === 'p' && last.text === '') {
      focusBlock(last.id)
      return
    }
    // Prefer focusing any trailing empty paragraph
    for (let i = doc.blocks.length - 1; i >= 0; i--) {
      const b = doc.blocks[i]!
      if (b.type === 'p' && b.text === '') {
        focusBlock(b.id)
        return
      }
      break
    }
    const nb = emptyBlock('p')
    emit({ notion: 1, blocks: [...doc.blocks, nb] })
    focusBlock(nb.id)
  }

  const lastIsEmptyP =
    doc.blocks.length > 0 &&
    doc.blocks[doc.blocks.length - 1]!.type === 'p' &&
    doc.blocks[doc.blocks.length - 1]!.text === ''

  const commands = useMemo(
    () => (slash ? filterSlash(slash.query) : []),
    [slash]
  )

  return (
    <div className={cn('h-full min-h-0 overflow-auto bg-mac-surface', className)}>
      <div
        className="mx-auto min-h-full max-w-2xl px-5 py-8 sm:px-12"
        onClick={(e) => {
          // Click empty padding → focus/create a single empty block (no duplicate)
          if (e.target === e.currentTarget) ensureEmptyBlock()
        }}
      >
        {doc.blocks.map((block, index) => (
          <BlockView
            key={block.id}
            block={block}
            listIndex={index}
            numberIndex={
              block.type === 'number'
                ? doc.blocks.slice(0, index + 1).filter((b) => b.type === 'number').length
                : 0
            }
            onText={(text) => {
              updateBlock(block.id, { text })
              const m = /^\/([^\s]*)$/.exec(text)
              if (m && block.type !== 'code' && block.type !== 'divider') {
                setSlash({ blockId: block.id, query: m[1] ?? '', index: 0 })
              } else if (slash?.blockId === block.id) {
                setSlash(null)
              }
            }}
            onChecked={(checked) => updateBlock(block.id, { checked })}
            onKeyDown={(e) => {
              if (slash && slash.blockId === block.id && commands.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSlash((s) =>
                    s ? { ...s, index: (s.index + 1) % commands.length } : s
                  )
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSlash((s) =>
                    s
                      ? { ...s, index: (s.index - 1 + commands.length) % commands.length }
                      : s
                  )
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  setType(block.id, commands[slash.index]!.id)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setSlash(null)
                  return
                }
              }

              if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
                e.preventDefault()
                if (slash && commands[slash.index]) {
                  setType(block.id, commands[slash.index]!.id)
                  return
                }
                const cont =
                  block.type === 'bullet' || block.type === 'number' || block.type === 'todo'
                    ? block.type
                    : 'p'
                const nid = insertAfter(block.id, cont)
                focusBlock(nid)
                return
              }

              if (
                e.key === 'Backspace' &&
                block.text === '' &&
                block.type !== 'divider'
              ) {
                e.preventDefault()
                if (block.type !== 'p') {
                  // Turn heading/list back into plain paragraph (Notion-like)
                  updateBlock(block.id, { type: 'p', checked: undefined })
                } else {
                  removeBlock(block.id)
                }
              }
            }}
          />
        ))}

        {/* Only show helper when last block already has content — never duplicate empty line */}
        {!lastIsEmptyP && (
          <button
            type="button"
            className="mt-1 w-full rounded-mac px-2 py-2 text-left text-[14px] text-mac-label-tertiary hover:bg-mac-control/50"
            onClick={ensureEmptyBlock}
          >
            Type / for commands…
          </button>
        )}
      </div>

      {slash && commands.length > 0 && (
        <div className="fixed left-1/2 top-[38%] z-[230] max-h-72 w-72 -translate-x-1/2 overflow-auto rounded-mac-xl border border-mac-separator bg-mac-surface/95 py-1 shadow-mac-lg backdrop-blur-xl">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-mac-label-tertiary">
            Turn into
          </div>
          {commands.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              className={cn(
                'flex w-full flex-col px-3 py-2 text-left',
                i === slash.index ? 'bg-mac-accent text-white' : 'hover:bg-mac-control'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                setType(slash.blockId, cmd.id)
              }}
            >
              <span className="text-[13px] font-medium">
                {cmd.label}
              </span>
              <span
                className={cn(
                  'text-[11px]',
                  i === slash.index ? 'text-white/70' : 'text-mac-label-tertiary'
                )}
              >
                {cmd.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BlockView({
  block,
  numberIndex,
  onText,
  onChecked,
  onKeyDown
}: {
  block: NotionBlock
  listIndex: number
  numberIndex: number
  onText: (t: string) => void
  onChecked: (c: boolean) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  // Track last type so we force-sync DOM when slash "turn into" changes type
  const typeRef = useRef(block.type)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const typeChanged = typeRef.current !== block.type
    typeRef.current = block.type

    const current = el.innerText.replace(/\n$/, '')
    if (current === block.text && !typeChanged) return

    // Always sync when type changes (slash apply) or when React text diverges
    // (e.g. cleared "/h1"). While typing normally, onInput keeps them equal.
    const wasFocused = document.activeElement === el
    el.innerText = block.text
    if (wasFocused) {
      const range = document.createRange()
      const sel = window.getSelection()
      range.selectNodeContents(el)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [block.text, block.id, block.type])

  if (block.type === 'divider') {
    return (
      <div
        className="flex items-center py-3 outline-none"
        data-block-id={block.id}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="h-px w-full bg-mac-separator" />
      </div>
    )
  }

  return (
    <div className="group flex items-start gap-2 rounded-mac px-1 py-0.5 hover:bg-mac-control/30">
      {block.type === 'todo' && (
        <input
          type="checkbox"
          className="mt-[0.55rem] accent-mac-accent"
          checked={!!block.checked}
          onChange={(e) => onChecked(e.target.checked)}
        />
      )}
      {block.type === 'bullet' && (
        <span className="mt-[0.45rem] w-4 shrink-0 text-center text-mac-label-tertiary">•</span>
      )}
      {block.type === 'number' && (
        <span className="mt-[0.45rem] w-5 shrink-0 text-right text-[13px] text-mac-label-tertiary">
          {numberIndex}.
        </span>
      )}
      {block.type === 'quote' && (
        <span className="mt-1 w-[3px] shrink-0 self-stretch rounded-full bg-mac-accent/45" />
      )}

      <div
        ref={ref}
        data-block-id={block.id}
        contentEditable
        suppressContentEditableWarning
        className={cn(
          'min-h-[1.6em] w-full flex-1 whitespace-pre-wrap break-words outline-none empty:before:pointer-events-none',
          block.type === 'h1' && 'text-[30px] font-bold tracking-tight leading-[1.2]',
          block.type === 'h2' && 'text-[22px] font-semibold tracking-tight leading-snug',
          block.type === 'h3' && 'text-[17px] font-semibold leading-snug',
          block.type === 'p' && 'text-[15px] leading-relaxed',
          block.type === 'todo' && 'text-[15px] leading-relaxed',
          block.type === 'bullet' && 'text-[15px] leading-relaxed',
          block.type === 'number' && 'text-[15px] leading-relaxed',
          block.type === 'quote' && 'text-[15px] italic leading-relaxed text-mac-label-secondary',
          block.type === 'code' &&
            'rounded-mac bg-mac-control px-3 py-2 font-mono text-[13px] leading-relaxed'
        )}
        data-placeholder={placeholder(block.type)}
        onInput={(e) => {
          // contentEditable may add trailing newline / <br>
          let t = e.currentTarget.innerText
          // Normalize lone BR / empty
          if (t === '\n' || t === '\r\n') t = ''
          t = t.replace(/\n$/, '')
          onText(t)
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

function placeholder(type: BlockType): string {
  switch (type) {
    case 'h1':
      return 'Heading 1'
    case 'h2':
      return 'Heading 2'
    case 'h3':
      return 'Heading 3'
    case 'code':
      return 'Code'
    case 'quote':
      return 'Quote'
    case 'todo':
      return 'To-do'
    case 'bullet':
    case 'number':
      return 'List'
    default:
      return "Type '/' for commands"
  }
}
