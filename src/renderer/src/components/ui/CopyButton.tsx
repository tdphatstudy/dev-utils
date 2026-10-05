import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy, LoaderCircle } from 'lucide-react'
import { cn, copyText } from '@renderer/lib/utils'

interface Props {
  text: string
  className?: string
  label?: string
}

export function CopyButton({ text, className, label = 'Copy' }: Props): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const requestVersion = useRef(0)
  const copying = useRef(false)
  const currentText = useRef(text)
  currentText.current = text
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestVersion.current++
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])
  useEffect(() => {
    requestVersion.current++
    copying.current = false
    setPending(false)
    setCopied(false)
    setFailed(false)
    if (timer.current) clearTimeout(timer.current)
  }, [text])

  const onCopy = async (): Promise<void> => {
    if (!text || copying.current) return
    const request = ++requestVersion.current
    copying.current = true
    if (timer.current) clearTimeout(timer.current)
    setPending(true)
    setCopied(false)
    setFailed(false)
    let succeeded = false
    try {
      await copyText(text)
      if (!mounted.current || request !== requestVersion.current || text !== currentText.current) return
      setCopied(true)
      setFailed(false)
      succeeded = true
    } catch {
      if (!mounted.current || request !== requestVersion.current || text !== currentText.current) return
      setCopied(false)
      setFailed(true)
    } finally {
      if (mounted.current && request === requestVersion.current) {
        copying.current = false
        setPending(false)
      }
    }
    if (!mounted.current || request !== requestVersion.current || !succeeded) return
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      disabled={!text || pending}
      title={failed ? 'Clipboard access failed. Select the output and copy it with Ctrl/⌘ + C, or try again.' : !text ? 'Nothing to copy yet.' : undefined}
      aria-live="polite"
      aria-atomic="true"
      aria-busy={pending}
      className={cn(
        'mac-btn-secondary whitespace-nowrap disabled:opacity-40',
        copied && '!bg-mac-success/15 !text-mac-success',
        failed && '!text-mac-danger',
        className
      )}
    >
      {pending ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : copied ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      ) : failed ? (
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? 'Copied' : failed ? 'Copy failed · retry' : label}
    </button>
  )
}
