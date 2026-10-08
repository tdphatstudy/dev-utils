import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep, join } from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const root = resolve('out/renderer'), mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' }
const mainEntry = /src="\.\/(assets\/index-[^"]+\.js)"/.exec(await readFile(join(root,'index.html'),'utf8'))?.[1]
assert.ok(mainEntry, 'Main entry missing')
const server = createServer(async (request,response) => { try { const path=resolve(root,'.'+new URL(request.url,'http://localhost').pathname); if(!path.startsWith(root+sep)) return response.writeHead(403).end(); response.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(await readFile(path)) } catch { response.writeHead(404).end() } })
await new Promise(done=>server.listen(0,'127.0.0.1',done)); const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({channel:process.env.UX_BROWSER_CHANNEL||undefined,headless:true}), page=await browser.newPage({viewport:{width:620,height:600}})
page.setDefaultTimeout(10000)
const errors=[],requests=[],external=[]; page.on('pageerror',error=>errors.push(error.message)); page.on('request',request=>requests.push(request.url()))
await page.route('**/*',route=>{ if(new URL(route.request().url()).origin===origin) return route.continue(); external.push(route.request().url()); return route.abort() })
await page.addInitScript(() => {
  const kind=new URL(location.href).searchParams.get('kind')||'clipboard', locale=new URL(location.href).searchParams.get('locale')||'en', dark=new URL(location.href).searchParams.get('dark')!=='0'
  const now=Date.now(), first='11111111-1111-4111-a111-111111111111', second='22222222-2222-4222-a222-222222222222'
  const contents={ [first]:{text:'{ "count":9007199254740993, "count":2, "label":"a b" }'}, [second]:{text:'hello world '+ 'x'.repeat(230)+' long-search-match'} }
  let items=Object.entries(contents).map(([id,c],i)=>({id,kind:i?'text':'json',preview:c.text.slice(0,200),label:'',pinned:false,firstAt:now-i,lastAt:now-i,copies:1,bytes:c.text.length,hasHtml:false}))
  let preferences={enabled:true,persist:false,retentionDays:1,maxEntries:200,excludeText:[]}, paused=false, blocked=null
  const callbacks=new Set(), fire=()=>callbacks.forEach(fn=>fn()), shortcutCallbacks=new Set()
  let globals={platform:'win32',bindings:{clipboard:'Mod+Shift+Space',color:null,ocr:null,transform:null},registered:['clipboard'],failed:[]}
  const f=window.__quickFixture={copies:[],opens:[],closes:0,pins:[],clear:0,ocr:[],mockStarts:[],changed:fire,block(value){blocked=value;fire()},seed(){
    const values=[['url','https://devfusion.local/docs','Architecture notes'],['color','#007AFF','Accent color'],['text','pnpm typecheck && pnpm build','Validation commands'],['json','{"name":"DevFusion","local":true}','API payload'],['text','SELECT id, name FROM users LIMIT 20;','SQL snippet'],['text','Tiếng Việt — Xin chào 👋',''],['url','http://localhost:3000','Frontend dev server']]
    values.forEach(([kind,text,label],i)=>{const id='33333333-3333-4333-a333-'+String(i).padStart(12,'0');contents[id]={text};items.push({id,kind,label,pinned:i===0,preview:text,firstAt:now-i-3,lastAt:now-i-3,copies:i===2?3:1,bytes:text.length,hasHtml:false})});fire()
  }}
  const clip={
    state:async()=>({preferences,paused,blocked,encryptionAvailable:true,count:items.length,bytes:1000,skipped:0,error:null}),
    configure:async p=>{preferences=p;fire();return clip.state()}, pause:async value=>{paused=value;fire();return clip.state()},
    list:async query=>{if(blocked)throw Error('blocked');return items.filter(item=>!query||(contents[item.id].text+' '+item.label).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.lastAt-a.lastAt)},
    content:async id=>{if(blocked)throw Error('blocked');return contents[id]},copy:async(id,mode,close)=>{f.copies.push({text:contents[id].text,mode,close});if(close)f.closes++},copyText:async(text,close)=>{f.copies.push({text,close});if(close)f.closes++},
    update:async(id,value)=>{Object.assign(items.find(item=>item.id===id),value);fire()}, remove:async ids=>{items=items.filter(item=>!ids.includes(item.id));fire()}, clear:async()=>{items=[];f.clear++;fire()}, captureCurrent:async()=>{},ocr:async()=>'OCR fixture',onChanged:fn=>{callbacks.add(fn);return()=>callbacks.delete(fn)}
  }
  let mock={running:false,port:null,baseUrl:null,name:null,startedAt:null,requests:0,logs:[]}
  const progress=new Set()
  window.quickTools={clipboard:clip,copyText:clip.copyText,copyImage:async png=>f.copies.push({png}),context:async()=>({kind,locale,dark}),close:async()=>{f.closes++},pin:async value=>f.pins.push(value),pickColor:async()=>f.opens.push('pick'),lastColor:async()=>'#FF8800',open:async kind=>f.opens.push(kind),shortcuts:async()=>({}),onShortcutsChanged:()=>()=>{},
    ocr:{capture:async mode=>f.opens.push('ocr-'+mode),recognize:async input=>{f.ocr.push({kind:input.kind,bytes:input.bytes.length,language:input.language});progress.forEach(fn=>fn({id:input.id,stage:'fixture',page:1,total:1,percent:100}));return{text:'DevFusion OCR fixture — Tiếng Việt',pages:1,ocrPages:1}},cancel:async()=>true,onProgress:fn=>{progress.add(fn);return()=>progress.delete(fn)}},
    mock:{status:async()=>mock,config:async()=>null,start:async yaml=>{f.mockStarts.push(yaml);return mock={...mock,running:true,port:3100,baseUrl:'http://127.0.0.1:3100'}},stop:async()=>mock={...mock,running:false,port:null,baseUrl:null}}}
  window.devutils={clipboard:clip,quickTools:{open:async kind=>f.opens.push(kind),shortcuts:async()=>globals,onShortcutsChanged:fn=>{shortcutCallbacks.add(fn);return()=>shortcutCallbacks.delete(fn)},checkShortcut:async()=>({available:true,reason:'Available to register'}),setShortcuts:async bindings=>{globals={platform:'win32',bindings,registered:Object.keys(bindings).filter(id=>bindings[id]),failed:[]};shortcutCallbacks.forEach(fn=>fn());return globals}},platform:async()=>'win32',window:{isMaximized:async()=>false,close(){},minimize(){},maximize(){}},app:{language:async()=>({language:locale,resolved:locale}),onLanguageChanged:()=>()=>{},trayAvailable:async()=>true,onOpenTool:()=>()=>{}},security:{state:async()=>({idleMinutes:15}),onVaultLocked:()=>()=>{}}}
})
const shot=process.env.QUICK_TOOLS_SCREENSHOTS
async function open(kind,locale='en',dark=true){await page.goto(origin+'/quick.html?kind='+kind+'&locale='+locale+'&dark='+(dark?'1':'0'));await page.locator('.quick-card,.clip-panel').waitFor()}
try {
  await open('clipboard'); await page.getByRole('button',{name:'Pause capture',exact:true}).waitFor(); await page.locator('.clip-row').first().waitFor()
  assert.ok(await page.evaluate(()=>document.querySelector('.clip-footer').getBoundingClientRect().bottom<=document.querySelector('.quick-content').getBoundingClientRect().bottom),'Clipboard footer needs outer scrolling')
  assert.equal(await page.locator('.clip-preview').count(),0); assert.equal(await page.getByRole('checkbox').count(),0)
  await page.getByRole('button',{name:/^Copy entry:/}).first().click()
  assert.deepEqual(await page.evaluate(()=>window.__quickFixture.copies.at(-1)),{text:'{ "count":9007199254740993, "count":2, "label":"a b" }',mode:'original',close:true}); assert.equal(await page.evaluate(()=>window.__quickFixture.closes),1)
  await page.getByRole('button',{name:/^Preview entry:/}).first().click()
  await page.getByLabel('Transform preview').selectOption('json-minify'); await page.getByRole('button',{name:'Copy & close',exact:true}).click()
  assert.equal((await page.evaluate(()=>window.__quickFixture.copies.at(-1))).text,'{"count":9007199254740993,"count":2,"label":"a b"}')
  await page.getByRole('button',{name:'Pin',exact:true}).click(); await page.getByRole('button',{name:'Back to history',exact:true}).click()
  await page.getByRole('button',{name:'Pinned',exact:true}).click(); assert.equal(await page.locator('.clip-row').count(),1)
  await page.getByRole('button',{name:'All',exact:true}).click(); await page.getByLabel('More clipboard types').selectOption('text'); assert.equal(await page.locator('.clip-row').count(),1)
  await page.getByRole('button',{name:'JSON',exact:true}).click(); assert.equal(await page.locator('.clip-row').count(),1)
  await page.getByRole('button',{name:'All',exact:true}).click(); const copiedBeforeSearch=await page.evaluate(()=>window.__quickFixture.copies.length)
  await page.getByRole('textbox',{name:'Search clipboard',exact:true}).fill('long-search-match'); await page.keyboard.press('Enter'); assert.equal(await page.evaluate(()=>window.__quickFixture.copies.length),copiedBeforeSearch)
  await page.waitForFunction(()=>document.querySelectorAll('.clip-row').length===1)
  await page.keyboard.press('Enter'); assert.ok((await page.evaluate(()=>window.__quickFixture.copies.at(-1))).text.includes('long-search-match'))
  await page.getByRole('textbox',{name:'Search clipboard',exact:true}).fill(''); await page.waitForFunction(()=>document.querySelectorAll('.clip-row').length===2)
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Alt+Enter'); await page.getByLabel('Clipboard preview').waitFor(); await page.keyboard.press('Escape')
  assert.equal(await page.locator('.clip-preview').count(),0); assert.equal(await page.evaluate(()=>window.__quickFixture.closes),3)
  await page.keyboard.press('Control+Shift+Enter'); assert.equal((await page.evaluate(()=>window.__quickFixture.copies.at(-1))).mode,'plain')
  await page.getByLabel('History actions').click(); await page.getByRole('button',{name:'Select multiple',exact:true}).click()
  await page.getByRole('checkbox',{name:/Select for merge/}).nth(0).check(); await page.getByRole('checkbox',{name:/Select for merge/}).nth(1).check(); await page.getByRole('button',{name:'Merge & copy',exact:true}).click()
  assert.ok((await page.evaluate(()=>window.__quickFixture.copies.at(-1))).text.includes('\nhello world')); await page.getByRole('button',{name:'Cancel',exact:true}).click()
  console.log('PASS auto-capture UI, one-click copy/close, lossless JSON, search guard, keyboard preview and ordered merge')
  await page.getByLabel('History actions').click(); await page.getByRole('button',{name:'Clear history',exact:true}).click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(()=>window.__quickFixture.clear),0)
  await page.getByRole('button',{name:'Clipboard settings',exact:true}).click(); await page.getByLabel('Keep encrypted history after restart').check(); await page.getByRole('button',{name:'Save preferences',exact:true}).click(); await page.getByText('Encrypted on this device',{exact:false}).waitFor()
  await page.getByRole('button',{name:'Pause capture',exact:true}).click(); await page.getByRole('button',{name:'Resume capture',exact:true}).click(); await page.getByRole('button',{name:'Pause capture',exact:true}).waitFor()
  await page.evaluate(()=>window.__quickFixture.block('vault')); await page.getByText('Clipboard history is hidden for privacy.',{exact:true}).waitFor(); assert.equal(await page.locator('.clip-row').count(),0); assert.equal(await page.locator('.clip-text').count(),0)
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[])
  console.log('PASS clear cancellation, settings dialog, encrypted persistence choice, pause/resume and immediate vault masking')
  await open('random'); await page.waitForFunction(()=>document.querySelector('textarea').value.length===36); await page.getByRole('button',{name:'Generate 5',exact:true}).click(); assert.equal((await page.getByLabel('Generated UUIDs').inputValue()).split('\n').length,5); await page.getByRole('button',{name:'Copy result',exact:true}).click()
  await open('timestamp'); await page.getByRole('textbox').fill('0'); await page.getByText('1970-01-01T00:00:00.000Z',{exact:true}).waitFor()
  await open('transform'); await page.getByRole('textbox').first().fill('Tiếng Việt 👋'); await page.getByLabel('Transformation').selectOption('base64-encode'); await page.getByRole('button',{name:'Copy result',exact:true}).click(); assert.ok((await page.evaluate(()=>window.__quickFixture.copies.at(-1))).text.length>10)
  await open('json'); await page.getByRole('textbox').first().fill('{"a":9007199254740993,"a":2}'); await page.getByLabel('Transformation').selectOption('json-minify'); await page.getByRole('button',{name:'Copy result',exact:true}).click(); assert.equal((await page.evaluate(()=>window.__quickFixture.copies.at(-1))).text,'{"a":9007199254740993,"a":2}')
  await open('base64'); await page.getByRole('textbox').first().fill('Xin chào'); await page.getByRole('button',{name:'Copy result',exact:true}).click(); const b64=(await page.evaluate(()=>window.__quickFixture.copies.at(-1))).text; await page.getByRole('textbox').first().fill(b64); await page.getByLabel('Transformation').selectOption('base64-decode'); assert.equal(await page.getByLabel('Transform result').inputValue(),'Xin chào')
  await open('qr'); await page.getByRole('textbox').fill('https://devfusion.local'); await page.getByAltText('Generated QR code').waitFor(); await page.getByRole('button',{name:'Copy QR image',exact:true}).click(); const qr=(await page.evaluate(()=>window.__quickFixture.copies.at(-1))).png; assert.ok(qr.startsWith('iVBOR'))
  await page.getByRole('textbox').fill('different input')
  const qrChooser=page.waitForEvent('filechooser'); await page.getByRole('button',{name:'Read QR image',exact:true}).click(); await (await qrChooser).setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(qr,'base64')})
  await page.waitForFunction(()=>window.__quickFixture.pins.includes(true)&&window.__quickFixture.pins.at(-1)===false)
  await page.waitForFunction(()=>document.querySelector('textarea').value==='https://devfusion.local')
  await open('ocr'); const chooser=page.waitForEvent('filechooser'); await page.getByRole('button',{name:'Choose image or PDF',exact:true}).click(); await (await chooser).setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(qr,'base64')}); await page.getByRole('button',{name:'Extract text',exact:true}).click(); await page.waitForFunction(()=>document.querySelector('textarea').value.includes('Tiếng Việt'))
  assert.deepEqual((await page.evaluate(()=>window.__quickFixture.ocr))[0],{kind:'image',bytes:Buffer.from(qr,'base64').length,language:'eng+vie'})
  await page.getByRole('button',{name:'Copy result',exact:true}).click()
  await page.getByRole('button',{name:'Capture screen region…',exact:true}).click(); assert.deepEqual(await page.evaluate(()=>window.__quickFixture.opens),['ocr-region'])
  await open('mock'); await page.getByRole('button',{name:'Start server',exact:true}).waitFor(); assert.equal((await page.evaluate(()=>window.__quickFixture.mockStarts)).length,0); await page.getByRole('button',{name:'Start server',exact:true}).click(); await page.getByRole('button',{name:'Stop server',exact:true}).click(); await page.getByText('Stopped',{exact:true}).waitFor()
  await open('color'); await page.waitForFunction(()=>window.__quickFixture.opens.length===1); assert.deepEqual(await page.evaluate(()=>window.__quickFixture.opens),['pick']); assert.equal(await page.getByRole('button',{name:'Pick screen color…',exact:true}).count(),0)
  console.log('PASS instant picker, ready UUID/time, JSON/Base64, real QR encode/decode, bounded OCR and explicit Mock API controls')
  await open('clipboard'); await page.evaluate(()=>window.__quickFixture.seed()); await page.waitForFunction(()=>document.querySelectorAll('.clip-row').length===9); await page.getByLabel('Search clipboard').focus(); await page.keyboard.press('Control+9'); assert.equal((await page.evaluate(()=>window.__quickFixture.copies.at(-1))).text,'http://localhost:3000')
  for(const locale of ['en','vi','ar']) for(const width of [420,620,760]) for(const dark of [false,true]) {
    await page.setViewportSize({width,height:600}); await open('clipboard',locale,dark); await page.getByRole('textbox',{name:locale==='vi'?'Tìm trong clipboard':locale==='ar'?'البحث في الحافظة':'Search clipboard',exact:true}).waitFor(); await page.evaluate(()=>window.__quickFixture.seed()); await page.waitForFunction(()=>document.querySelectorAll('.clip-row').length===9)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Widget overflow: '+locale+' '+width)
    assert.ok(await page.evaluate(()=>document.querySelector('.clip-footer').getBoundingClientRect().bottom<=innerHeight),'History footer outside window')
    assert.ok(await page.evaluate(()=>{const image=document.querySelector('.quick-header img'),r=image.getBoundingClientRect();return image.naturalWidth>0&&r.width===r.height&&getComputedStyle(image).objectFit==='contain'}),'Logo distortion')
    if(shot && width===620 && dark){await mkdir(shot,{recursive:true});await page.screenshot({path:join(shot,'clipboard-'+locale+'.png')})}
  }
  assert.ok(!requests.some(url=>url.endsWith('/'+mainEntry)||/\/assets\/(?:AppShell|vendor-codemirror|vendor-sql|OcrTool|OcrHelper)/.test(url)),'Quick widget loaded full app/editor/OCR engines')
  assert.deepEqual(errors,[]); assert.deepEqual(external,[])
  console.log('PASS item-9 keyboard, 420/620/760px light/dark, EN/VI/AR, brand geometry, isolated lazy bundle and no remote traffic')
  await page.setViewportSize({width:1180,height:800}); await page.goto(`${origin}/index.html#/tool/text.clipboard`); await page.locator('[data-tool-ready="text.clipboard"]').waitFor(); await page.getByRole('button',{name:'Open quick widget',exact:true}).click(); assert.deepEqual(await page.evaluate(()=>window.__quickFixture.opens),['clipboard'])
  await page.goto(`${origin}/index.html#/tool/app.settings`); await page.locator('#global-shortcuts').waitFor(); await page.getByLabel('Global shortcut combination').fill('Mod+K'); await page.getByText('Already used in DevFusion:',{exact:false}).waitFor(); assert.equal(await page.locator('#global-shortcuts').getByRole('button',{name:'Save shortcut',exact:true}).isEnabled(),false)
  await page.getByLabel('Global shortcut combination').fill('Mod+Alt+U'); await page.getByRole('button',{name:'Check OS availability',exact:true}).click(); await page.getByText('Available to register',{exact:true}).waitFor()
  await page.locator('[data-shortcut-id="app.home"]').getByRole('button').first().click(); await page.getByRole('dialog').getByRole('button',{name:'Disable shortcut',exact:true}).click()
  await page.getByLabel('Global shortcut combination').fill('Mod+Shift+H'); await page.locator('#global-shortcuts').getByRole('button',{name:'Save shortcut',exact:true}).click()
  await page.getByText('Shortcut saved.',{exact:true}).waitFor()
  await page.locator('#shortcuts').getByRole('button',{name:'Reset all shortcuts',exact:true}).click()
  await page.getByRole('dialog').getByRole('alert').waitFor(); assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Reset all shortcuts',exact:true}).isEnabled(),false)
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click()
  console.log('PASS lazy full-tool entry, quick-widget launch and app/global shortcut collision checks')
} finally {await browser.close();await new Promise(done=>server.close(done))}
