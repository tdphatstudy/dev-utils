import { validateOcrInput, MAX_OCR_PIXELS, MAX_OCR_PAGES, MAX_OCR_TEXT, type OcrInput, type OcrResult, type OcrProgress } from '@shared/ocr/types'
import type { Worker as OcrWorker } from 'tesseract.js'

const status = document.getElementById('status')!
const bar = document.getElementById('progress') as HTMLProgressElement
const assets = new URL('./ocr-assets/', window.location.href).href
document.getElementById('cancel')!.addEventListener('click', () => void window.ocrHelper.close())
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') void window.ocrHelper.close() })

async function extract(input: OcrInput): Promise<OcrResult> {
  let worker: OcrWorker | undefined
  let pageNumber = 1, total = 1, lastProgress = 0
  const confidences: number[] = []
  const report = (stage: string, percent: number): void => {
    status.textContent = `${stage} · page ${pageNumber} of ${total}`
    bar.value = Math.round(((pageNumber - 1) + percent / 100) / total * 100)
    if (performance.now() - lastProgress < 150 && percent !== 100) return
    lastProgress = performance.now()
    const value: Omit<OcrProgress, 'id'> = { stage, page: pageNumber, total, percent }
    void window.ocrHelper.progress(value).catch(() => {})
  }
  const recognize = async (canvas: HTMLCanvasElement): Promise<string> => {
    if (!worker) {
      report('Loading OCR engine', 0)
      const { createWorker, PSM } = await import('tesseract.js')
      worker = await createWorker(input.language, 1, {
        workerPath: assets + 'worker.min.js', corePath: assets.replace(/\/$/, ''), langPath: assets.replace(/\/$/, ''),
        workerBlobURL: false, cacheMethod: 'none',
        logger: (message) => report(message.status === 'recognizing text' ? 'Recognizing text' : 'Loading OCR engine', Math.max(0, Math.min(100, message.progress * 100)))
      })
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' })
    }
    const { data } = await worker.recognize(canvas, {}, { text: true })
    confidences.push(data.confidence)
    return data.text.trim()
  }
  const canvas = document.createElement('canvas')
  let pdfTask: import('pdfjs-dist').PDFDocumentLoadingTask | undefined
  try {
    const texts: string[] = []
    let textLength = 0, ocrPages = 0
    const append = (text: string): void => {
      textLength += text.length + 2
      if (textLength > MAX_OCR_TEXT) throw new Error('Extracted text exceeds the 2 million character limit.')
      texts.push(text)
    }
    if (input.kind === 'image') {
      const bitmap = await createImageBitmap(new Blob([input.bytes as Uint8Array<ArrayBuffer>]))
      try {
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_OCR_PIXELS || Math.max(bitmap.width, bitmap.height) > 16384) throw new Error('Image exceeds 16 million pixels or 16384 pixels per side. Resize it before OCR.')
        canvas.width = bitmap.width; canvas.height = bitmap.height
        const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0)
      } finally { bitmap.close() }
      append(await recognize(canvas)); ocrPages = 1
    } else {
      report('Reading PDF', 0)
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = assets + 'pdf.worker.mjs'
      pdfTask = pdfjs.getDocument({ data: input.bytes, useSystemFonts: false,
        cMapUrl: assets + 'cmaps/', cMapPacked: true, standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/',
        maxImageSize: MAX_OCR_PIXELS, stopAtErrors: true })
      pdfTask.onPassword = () => { void pdfTask?.destroy(); void window.ocrHelper.fail('This PDF is password protected. Unlock it before importing.') }
      const pdf = await pdfTask.promise
      total = pdf.numPages
      if (total > MAX_OCR_PAGES) throw new Error('PDF has more than 50 pages. Split it into smaller files before importing.')
      for (pageNumber = 1; pageNumber <= total; pageNumber++) {
        report('Reading PDF text', 0)
        const page = await pdf.getPage(pageNumber)
        try {
          let text = ''
          if (!input.forceOcr) {
            const reader = page.streamTextContent().getReader(), parts: string[] = []
            let pageChars = 0
            try {
              while (true) {
                const chunk = await reader.read()
                if (chunk.done) break
                for (const item of chunk.value.items) {
                  if (!('str' in item)) continue
                  const part = item.str + (item.hasEOL ? '\n' : ' ')
                  pageChars += part.length
                  if (textLength + pageChars > MAX_OCR_TEXT) throw new Error('Extracted text exceeds the 2 million character limit.')
                  parts.push(part)
                }
              }
              text = parts.join('').trim()
            } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
          }
          if (text) append(text)
          else {
            const natural = page.getViewport({ scale: 1 })
            const scale = Math.min(2.5, Math.sqrt(MAX_OCR_PIXELS / (natural.width * natural.height)), 8192 / Math.max(natural.width, natural.height))
            if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid PDF page dimensions.')
            const viewport = page.getViewport({ scale })
            canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height)
            if (canvas.width < 1 || canvas.height < 1) throw new Error('Invalid PDF page dimensions.')
            await page.render({ canvas, canvasContext: canvas.getContext('2d', { alpha: false, willReadFrequently: true })!, viewport, background: '#ffffff' }).promise
            append(await recognize(canvas)); ocrPages++
          }
          report('Page complete', 100)
        } finally { canvas.width = canvas.height = 1; page.cleanup() }
      }
    }
    return { text: texts.join('\n\n'), pages: total, ocrPages, confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined }
  } finally {
    canvas.width = canvas.height = 1
    await Promise.allSettled([worker?.terminate(), pdfTask?.destroy()])
  }
}

void (async () => {
  try {
    const view = await window.ocrHelper.view()
    if (view.kind !== 'run') throw new Error('Invalid OCR view.')
    await window.ocrHelper.ready()
    await window.ocrHelper.complete(await extract(validateOcrInput(view.input)))
  } catch (error) {
    const message = error instanceof Error && /^(Image exceeds|PDF has more than|Extracted text exceeds|Invalid PDF page dimensions)/.test(error.message) ? error.message : 'Could not read this file. It may be damaged or unsupported; try a PNG/JPEG or an unlocked PDF.'
    await window.ocrHelper.fail(message).catch(() => {})
  }
})()
