import { useEffect, useMemo, useRef, useState } from 'react'
import { t, useI18n } from '@renderer/i18n'
import { ToolTextInput } from '@renderer/components/ui/ToolTextInput'
import { planHashCandidates, type CandidateRules, type HashSearchInput } from '@shared/security-testing/hash-search'
import { Field } from './Workbench'

export const SAMPLE_CANDIDATES = 'password\n123456\nadmin\nwelcome\nletmein\nqwerty\nchangeme\ntest\ndeveloper'
const CANDIDATE_SETS = {
  common: { label: 'Common candidates', value: SAMPLE_CANDIDATES },
  development: { label: 'Development defaults', value: 'dev\ndeveloper\nstaging\nlocalhost\nqa\ntest\nadmin\ndefault\nChangeMe123!' },
  numeric: { label: 'Common number sequences', value: '000000\n111111\n123456\n654321\n12345678\n123456789\n00000000\n123123' }
} as const

export function CandidatePanel({ dictionary, rules, disabled, onDictionary, onRules, onError }: { dictionary: string; rules: CandidateRules; disabled: boolean; onDictionary: (value: string) => void; onRules: (value: CandidateRules) => void; onError: (value: string) => void }): JSX.Element {
  useI18n()
  const [preset, setPreset] = useState<keyof typeof CANDIDATE_SETS>('common')
  const revision = useRef(0), previous = useRef({ dictionary, disabled })
  if (previous.current.dictionary !== dictionary || previous.current.disabled !== disabled) { revision.current++; previous.current = { dictionary, disabled } }
  useEffect(() => () => { revision.current++ }, [])
  return <div className="space-y-3">
    <Field label="Candidate set"><select className="mac-input" value={preset} onChange={event => setPreset(event.target.value as typeof preset)}>{Object.entries(CANDIDATE_SETS).map(([value, item]) => <option key={value} value={value}>{t(item.label)}</option>)}</select></Field>
    <div className="flex flex-wrap gap-2">
      <label className="mac-btn-secondary cursor-pointer focus-within:ring-2 focus-within:ring-mac-accent">{t('Import candidates')}<input type="file" accept=".txt,text/plain" aria-label={t('Import candidates')} disabled={disabled} className="sr-only" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''
        if (!file) return
        const current = ++revision.current
        try {
          if (file.size > 4194304) throw new Error('Candidate file must be UTF-8 and no larger than 4 MiB.')
          const bytes = await file.arrayBuffer()
          if (current !== revision.current) return
          const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
          planHashCandidates({ mode: 'dictionary', dictionary: value, alphabet: '', minLength: 0, maxLength: 0 })
          onDictionary(value)
        } catch (error) { if (current === revision.current) onError(t(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Candidate file must be UTF-8 and no larger than 4 MiB.')) }
      }} /></label>
      <button type="button" className="mac-btn-secondary" onClick={() => { revision.current++; const value = dictionary ? dictionary + '\n' + CANDIDATE_SETS[preset].value : CANDIDATE_SETS[preset].value; try { planHashCandidates({ mode: 'dictionary', dictionary: value, alphabet: '', minLength: 0, maxLength: 0 }); onDictionary(value) } catch (error) { onError(error instanceof Error ? error.message : 'Invalid candidates.') } }}>{t('Add common candidates')}</button>
    </div>
    <ToolTextInput label="Candidate dictionary" value={dictionary} maxLength={1048576} disabled={disabled} onChange={value => { revision.current++; onDictionary(value) }} />
    <p className="text-[12px] leading-relaxed text-mac-label-secondary">{t('One candidate per line. Spaces are kept; empty lines test an empty string. Up to 100,000 lines and 1,024 characters per line.')}</p>
    <details className="rounded-mac-lg border border-mac-separator p-3">
      <summary className="cursor-pointer text-[13px] font-medium">{t('Candidate variations')}</summary>
      <div className="mt-3 space-y-3"><div className="flex flex-wrap gap-3">{(['lowercase', 'uppercase', 'capitalize'] as const).map(key => <label key={key} className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={rules[key]} onChange={event => onRules({ ...rules, [key]: event.target.checked })} />{t({ lowercase: 'Lowercase', uppercase: 'Uppercase', capitalize: 'Capitalize' }[key])}</label>)}</div>
        <Field label="Suffixes (one per line)"><textarea className="mac-input min-h-20 font-mono" value={rules.suffixes} maxLength={512} spellCheck={false} autoComplete="off" placeholder={'123\n2026\n!'} onChange={event => onRules({ ...rules, suffixes: event.target.value })} /></Field>
        <p className="text-[12px] text-mac-label-secondary">{t('Original candidates are always included. Up to 16 suffixes. Rule combinations may repeat attempts.')}</p>
      </div>
    </details>
  </div>
}

export function CandidatePlan({ input, maxAttempts }: { input: HashSearchInput; maxAttempts: number }): JSX.Element {
  const { locale } = useI18n()
  const plan = useMemo(() => {
    try { const value = planHashCandidates(input); return { total: value.total, sample: Array.from((function* () { let count = 0; for (const item of value.candidates) { yield item; if (++count === 6) break } })()), error: null } }
    catch (error) { return { total: 0n, sample: [], error: error instanceof Error ? error.message : 'Invalid candidates.' } }
  }, [input.mode, input.dictionary, input.alphabet, input.minLength, input.maxLength, input.rules])
  return <div className="space-y-2 rounded-mac-lg border border-mac-separator bg-mac-control/40 p-3 text-[12px]">
    <p className="font-medium">{t('Search plan')} · {plan.total.toLocaleString(locale)} {t('candidates')}</p>
    {plan.error ? <p className="text-mac-danger">{t(plan.error)}</p> : <><p className="text-mac-label-secondary">{t('Attempts this run')} · {Number.isInteger(maxAttempts) && maxAttempts > 0 ? (plan.total < BigInt(maxAttempts) ? plan.total : BigInt(maxAttempts)).toLocaleString(locale) : '—'}</p>
      <div dir="ltr" className="flex flex-wrap gap-1.5">{plan.sample.map((value, index) => <code key={index} className="max-w-full truncate rounded bg-mac-control px-2 py-1">{value || '∅'}</code>)}</div></>}
  </div>
}
