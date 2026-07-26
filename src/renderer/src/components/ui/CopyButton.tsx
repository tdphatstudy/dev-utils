import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn, copyText } from '@renderer/lib/utils'

interface Props {
  text: string
  className?: string
  label?: string
}

export function CopyButton({ text, className, label = 'Copy' }: Props): JSX.Element {
  const [copied, setCopied] = useState(false)

  const onCopy = async (): Promise<void> => {
    if (!text) return
    await copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      disabled={!text}
      className={cn(
        'mac-btn-secondary disabled:opacity-40',
        copied && '!bg-mac-success/15 !text-mac-success',
        className
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied' : label}
    </button>
  )
}
