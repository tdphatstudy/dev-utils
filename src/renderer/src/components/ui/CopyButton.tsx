import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy } from 'lucide-react'
import { cn, copyText } from '@renderer/lib/utils'

interface Props {
  text: string
  className?: string
  label?: string
}

export function CopyButton({ text, className, label = 'Copy' }: Props): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current) }
  }, [])
  useEffect(() => { setCopied(false); setFailed(false) }, [text])

  const onCopy = async (): Promise<void> => {
    if (!text) return
    try {
      await copyText(text)
      if (!mounted.current) return
      setCopied(true)
      setFailed(false)
    } catch {
      if (!mounted.current) return
      setCopied(false)
      setFailed(true)
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setCopied(false); setFailed(false) }, 2000)
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      disabled={!text}
      title={failed ? 'Clipboard access failed. Select the output and copy it with Ctrl/⌘ + C, or try again.' : undefined}
      aria-live="polite"
      className={cn(
        'mac-btn-secondary disabled:opacity-40',
        copied && '!bg-mac-success/15 !text-mac-success',
        failed && '!text-mac-danger',
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
      ) : failed ? (
        <AlertCircle className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : failed ? 'Copy failed · retry' : label}
    </button>
  )
}
