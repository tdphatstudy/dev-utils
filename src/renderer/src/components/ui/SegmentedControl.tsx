import { useRef } from 'react'
import { cn } from '@renderer/lib/utils'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
  label?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  label = 'Options'
}: Props<T>): JSX.Element {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div className={cn('mac-segment', className)} role="group" aria-label={label}>
      {options.map((opt, index) => (
        <button
          key={opt.value}
          ref={(element) => { buttons.current[index] = element }}
          type="button"
          data-active={value === opt.value}
          aria-pressed={value === opt.value}
          tabIndex={value === opt.value || !options.some((option) => option.value === value) && index === 0 ? 0 : -1}
          className="mac-segment-item"
          onClick={() => onChange(opt.value)}
          onKeyDown={(event) => {
            const next = event.key === 'ArrowRight' ? (index + 1) % options.length
              : event.key === 'ArrowLeft' ? (index - 1 + options.length) % options.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null
            if (next === null) return
            event.preventDefault()
            buttons.current[next]?.focus()
            onChange(options[next].value)
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
