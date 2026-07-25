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
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className
}: Props<T>): JSX.Element {
  return (
    <div className={cn('mac-segment', className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          data-active={value === opt.value}
          aria-selected={value === opt.value}
          className="mac-segment-item"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
