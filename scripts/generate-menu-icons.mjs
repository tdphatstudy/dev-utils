// Rasterize installed Lucide vectors with their square viewBox and original curves.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClipboardList, Pipette, Copy, Fingerprint, ScanText, Scan, Monitor, Braces, Clock3, ArrowLeftRight, QrCode, Server, Settings, LockKeyhole, Languages, Power, Pause, Play, Square, CircleCheck, LayoutGrid } from 'lucide-react'
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const glyphs = {
  clipboard:[ClipboardList,'#2563eb','#60a5fa'], pipette:[Pipette,'#7c3aed','#c4b5fd'], copy:[Copy,'#0284c7','#7dd3fc'], uuid:[Fingerprint,'#9333ea','#d8b4fe'],
  ocr:[ScanText,'#0d9488','#5eead4'], region:[Scan,'#0d9488','#5eead4'], screen:[Monitor,'#2563eb','#93c5fd'], json:[Braces,'#d97706','#fbbf24'],
  time:[Clock3,'#0891b2','#67e8f9'], transform:[ArrowLeftRight,'#7c3aed','#c4b5fd'], qr:[QrCode,'#4f46e5','#a5b4fc'], server:[Server,'#ea580c','#fdba74'],
  settings:[Settings,'#475569','#cbd5e1'], lock:[LockKeyhole,'#d97706','#fcd34d'], language:[Languages,'#2563eb','#93c5fd'], quit:[Power,'#dc2626','#fca5a5'],
  pause:[Pause,'#d97706','#fcd34d'], play:[Play,'#16a34a','#86efac'], stop:[Square,'#dc2626','#fca5a5'], ready:[CircleCheck,'#16a34a','#86efac'], tools:[LayoutGrid,'#4f46e5','#a5b4fc']
}
const directory=resolve('resources/menu-icons'); await mkdir(directory,{recursive:true})
const browser=await chromium.launch({channel:process.env.UX_BROWSER_CHANNEL||undefined,headless:true})
try {
  const page=await browser.newPage({viewport:{width:32,height:32},deviceScaleFactor:1})
  const logo=await readFile(resolve('src/renderer/src/assets/logo.svg'),'utf8')
  for(const theme of ['light','dark']) {
    for(const [name,[Icon,light,dark]] of Object.entries(glyphs)) {
      const svg=renderToStaticMarkup(createElement(Icon,{width:32,height:32,strokeWidth:1.9,color:theme==='light'?light:dark}))
      await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:32px;height:32px}</style>${svg}`)
      await writeFile(join(directory,`${name}-${theme}.png`),await page.screenshot({omitBackground:true}))
    }
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:32px;height:32px}</style>${logo}`)
    await writeFile(join(directory,`app-${theme}.png`),await page.screenshot({omitBackground:true}))
  }
  console.log('Generated 44 colored vector menu icons; square geometry preserved')
} finally {await browser.close()}
