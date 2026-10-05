import { useEffect, useRef, useState } from 'react'
import { Pipette, Copy, Check, Palette } from 'lucide-react'
import { colorFromHex, normalizeHex } from '@shared/color'

export default function ColorPicker(): JSX.Element {
  const [input, setInput] = useState('#6366F1')
  const [recent, setRecent] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Choose a color or pick any pixel on your screen.')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const alive = useRef(true)
  const currentInput = useRef(input)
  currentInput.current = input
  const desktop = !!window.devutils?.color
  const color = colorFromHex(input)

  const choose = (hex: string): void => {
    setInput(hex); setError(null); setCopied(null)
    setRecent((previous) => [hex, ...previous.filter((item) => item !== hex)].slice(0, 12))
  }
  useEffect(() => {
    alive.current = true
    const initial = currentInput.current
    if (desktop) void window.devutils.color.lastScreen().then((hex) => {
      if (alive.current && currentInput.current === initial && hex && normalizeHex(hex)) choose(normalizeHex(hex)!)
    }).catch(() => {})
    const unsubscribe = window.devutils?.color?.onPicked((hex) => { choose(hex); setMessage(`Screen color ${hex} selected. Choose a format to copy in the popup.`) })
    return () => { alive.current = false; unsubscribe?.() }
  }, [])

  const pick = async (): Promise<void> => {
    if (!desktop || busy) return
    setBusy(true); setError(null); setCopied(null)
    setMessage('Click a screen pixel. Esc cancels; selection closes after two minutes.')
    try {
      const result = await window.devutils.color.pickScreen()
      if (!alive.current) return
      if (result) {
        choose(result.hex)
        setMessage(`${result.hex} selected. Choose HEX, RGB, HSL or HSV in the popup to copy; Repick selects another pixel.`)
      } else setMessage('Color picking canceled. Your current color is unchanged.')
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : 'Could not pick a screen color. Try a manual color.'); setMessage('Try again or enter a color below.') }
    } finally { if (alive.current) setBusy(false) }
  }
  const copy = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      if (alive.current) { setCopied(value); setError(null); setMessage(`${value} copied.`) }
    } catch { if (alive.current) setError('Clipboard copy failed. Select the value below and copy it manually.') }
  }

  return (
    <div className="h-full overflow-auto px-4 py-5 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-mac-label">A color, ready for your code.</p>
            <p className="mt-1 text-[13px] text-mac-label-secondary">Pick across your desktop. Copy HEX, RGB, HSL or HSV.</p>
          </div>
          <button type="button" className="mac-btn-primary gap-2" disabled={!desktop || busy} onClick={() => void pick()}>
            <Pipette className="h-4 w-4" />{busy ? 'Picking…' : 'Pick screen color'}
          </button>
        </div>
        {!desktop && <p className="rounded-mac-lg border border-mac-separator bg-mac-surface px-4 py-3 text-[13px] text-mac-label-secondary">Screen sampling requires the desktop app. Manual colors and conversions work here.</p>}
        <div className="grid gap-5 md:grid-cols-[minmax(220px,1fr)_minmax(0,1fr)]">
          <div className="flex min-h-[240px] flex-col justify-between rounded-mac-xl p-6 shadow-mac" style={{ backgroundColor: color?.hex ?? '#6366F1', color: color?.foreground ?? '#FFFFFF' }}>
            <Palette className="h-7 w-7 opacity-75" strokeWidth={1.5} />
            <div>
              <p className="font-mono text-[28px] font-semibold tracking-tight">{color?.hex ?? 'Invalid HEX'}</p>
              {color && <p className="mt-1 text-[12px] opacity-80">{color.foreground === '#000000' ? 'Black' : 'White'} text · {color.contrast.toFixed(2)}:1 contrast</p>}
            </div>
          </div>
          <div className="rounded-mac-xl border border-mac-separator bg-mac-surface p-5">
            <label htmlFor="color-hex" className="mb-2 block text-[12px] font-semibold text-mac-label-secondary">HEX color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={color?.hex ?? '#6366F1'} disabled={busy} aria-label="Choose a color" onChange={(event) => choose(event.target.value.toUpperCase())} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-mac-separator bg-transparent p-1" />
              <input id="color-hex" value={input} disabled={busy} maxLength={7} spellCheck={false} className="mac-input min-w-0 flex-1 font-mono" onChange={(event) => { setInput(event.target.value); setCopied(null) }} onBlur={() => { if (color) choose(color.hex) }} aria-invalid={!color} aria-describedby={!color ? 'color-validation' : undefined} />
            </div>
            {!color && <p id="color-validation" role="alert" className="mt-2 text-[12px] text-mac-danger">Enter 3 or 6 hexadecimal digits, such as #F80 or #6366F1.</p>}
            <div className="mt-5 space-y-2">
              {[['HEX', color?.hex], ['RGB', color?.rgb], ['HSL', color?.hsl], ['HSV', color?.hsv]].map(([label, value]) => <div key={label} className="flex items-center gap-2 rounded-lg bg-mac-control px-3 py-2.5">
                <span className="w-8 shrink-0 text-[11px] font-semibold text-mac-label-tertiary">{label}</span>
                <input readOnly aria-label={`${label} value`} value={value ?? ''} className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-mac-label outline-none" />
                <button type="button" className="mac-btn-ghost h-7 w-7 !p-0" aria-label={`Copy ${label}`} disabled={!value} onClick={() => value && void copy(value)}>{copied === value ? <Check className="h-3.5 w-3.5 text-mac-success" /> : <Copy className="h-3.5 w-3.5" />}</button>
              </div>)}
            </div>
          </div>
        </div>
        <div role="status" aria-live="polite" className="text-[13px] text-mac-label-secondary">{message}</div>
        {error && <p role="alert" className="text-[13px] text-mac-danger">{error}</p>}
        {recent.length > 0 && <section className="rounded-mac-xl border border-mac-separator bg-mac-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[12px] font-semibold text-mac-label-secondary">Recent colors in this view</h2>
            <button type="button" className="mac-btn-ghost !text-[12px]" onClick={() => setRecent([])}>Clear colors</button>
          </div>
          <div className="flex flex-wrap gap-2">{recent.map((hex) => <button key={hex} type="button" aria-label={`Use ${hex}`} title={hex} disabled={busy} onClick={() => choose(hex)} className="h-9 w-9 rounded-lg border border-black/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mac-accent" style={{ backgroundColor: hex }} />)}</div>
        </section>}
        <p className="text-[12px] leading-relaxed text-mac-label-tertiary">Nothing is uploaded. Desktop snapshots stay in RAM only while choosing a pixel, then are released. The popup offers format-specific Copy and Repick; clipboard changes only when you copy. Recent colors clear when this view closes. The tray keeps only the last screen color until you quit.</p>
      </div>
    </div>
  )
}
