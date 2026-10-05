import { useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { generateLorem, loremWordCount, type LoremOptions, type LoremUnit } from '@shared/lorem'
import { CopyButton } from '@renderer/components/ui/CopyButton'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { ToolStatus, ToolToolbar } from '@renderer/components/ui/ToolToolbar'

export default function LoremTool(): JSX.Element {
  const [unit, setUnit] = useState<LoremUnit>('paragraphs')
  const [count, setCount] = useState('3')
  const [wordsPerSentence, setWordsPerSentence] = useState('12')
  const [sentencesPerParagraph, setSentencesPerParagraph] = useState('4')
  const [startWithLorem, setStartWithLorem] = useState(true)
  const [nonce, setNonce] = useState(0)
  const result = useMemo(() => {
    void nonce
    try {
      const options: LoremOptions = { unit, count: Number(count), wordsPerSentence: Number(wordsPerSentence), sentencesPerParagraph: Number(sentencesPerParagraph), startWithLorem }
      return { text: generateLorem(options), words: loremWordCount(options), error: '' }
    } catch (error) { return { text: '', words: 0, error: error instanceof Error ? error.message : 'Could not generate text.' } }
  }, [unit, count, wordsPerSentence, sentencesPerParagraph, startWithLorem, nonce])

  const download = (): void => {
    if (!result.text) return
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'lorem.txt'; anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolToolbar>
        <SegmentedControl label="Lorem output unit" value={unit} onChange={setUnit} options={[{ value: 'words', label: 'Words' }, { value: 'sentences', label: 'Sentences' }, { value: 'paragraphs', label: 'Paragraphs' }]} />
        <button type="button" className="mac-btn-primary" disabled={!!result.error} onClick={() => setNonce((value) => value + 1)}><RefreshCw className="h-3.5 w-3.5" />Regenerate</button>
        <div className="ml-auto flex gap-2"><CopyButton text={result.text} /><button type="button" className="mac-btn-secondary" disabled={!result.text} onClick={download}><Download className="h-3.5 w-3.5" />Save .txt</button></div>
      </ToolToolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-wrap items-end gap-4 rounded-mac-lg border border-mac-separator bg-mac-surface p-4">
          <label className="grid gap-1.5 text-[12px] text-mac-label-secondary" htmlFor="lorem-count">{unit === 'words' ? 'Word count' : unit === 'sentences' ? 'Sentence count' : 'Paragraph count'}<input id="lorem-count" type="number" min={1} max={10_000} step={1} aria-invalid={!!result.error} className="mac-input !w-28 font-mono" value={count} onChange={(event) => setCount(event.target.value)} /></label>
          {unit !== 'words' && <label className="grid gap-1.5 text-[12px] text-mac-label-secondary" htmlFor="lorem-words">Words per sentence<input id="lorem-words" type="number" min={1} max={100} step={1} className="mac-input !w-28 font-mono" value={wordsPerSentence} onChange={(event) => setWordsPerSentence(event.target.value)} /></label>}
          {unit === 'paragraphs' && <label className="grid gap-1.5 text-[12px] text-mac-label-secondary" htmlFor="lorem-sentences">Sentences per paragraph<input id="lorem-sentences" type="number" min={1} max={20} step={1} className="mac-input !w-28 font-mono" value={sentencesPerParagraph} onChange={(event) => setSentencesPerParagraph(event.target.value)} /></label>}
          <label className="flex items-center gap-2 py-2 text-[12px] text-mac-label-secondary"><input type="checkbox" className="accent-mac-accent" checked={startWithLorem} onChange={(event) => setStartWithLorem(event.target.checked)} />Start with “Lorem ipsum…”</label>
          <p className="w-full text-[12px] text-mac-label-tertiary">Placeholder text for layouts, forms and mock content. Up to 10,000 words, generated locally.</p>
        </div>
        {result.error && <p role="alert" className="text-[13px] text-mac-danger">{result.error}</p>}
        <label htmlFor="lorem-output" className="text-[11px] font-semibold uppercase tracking-wide text-mac-label-tertiary">Generated text</label>
        <textarea id="lorem-output" aria-label="Generated Lorem text" readOnly value={result.text} spellCheck={false} className="mac-input min-h-[240px] flex-1 resize-y !p-4 text-[14px] leading-relaxed" placeholder="Choose a valid count to generate text." />
      </div>
      <footer className="border-t border-mac-separator px-4 py-2"><ToolStatus tone={result.error ? 'danger' : 'success'}>{result.error || `${result.words.toLocaleString()} words · ${result.text.length.toLocaleString()} characters`}</ToolStatus></footer>
    </div>
  )
}
