/* Small isolated desktop helper. No remote code, persistence or full toolbox. */
const api = window.screenPicker
const byId = id => document.getElementById(id)
let mode, pending = false
const report = error => {
  const status = byId('status')
  status.setAttribute('role', 'alert')
  status.textContent = error instanceof Error ? error.message : 'The action failed. Try again.'
}
const run = async action => {
  if (pending) return
  pending = true
  try { await action() } catch (error) { report(error) } finally { pending = false }
}
byId('close').onclick = () => run(() => api.close())
byId('cancel').onclick = () => run(() => api.cancel())
byId('repick').onclick = () => run(() => api.repick())
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); void run(() => mode === 'overlay' ? api.cancel() : api.close()) }
})

async function init() {
  const view = await api.view()
  mode = view.kind
  if (view.kind === 'result') {
    byId('result').hidden = false
    byId('swatch').style.backgroundColor = view.color.hex
    byId('swatch').style.color = view.color.foreground
    byId('selected-hex').textContent = view.color.hex
    byId('contrast').textContent = `${view.color.foreground === '#000000' ? 'Black' : 'White'} text · ${view.color.contrast.toFixed(2)}:1 contrast`
    for (const format of ['hex', 'rgb', 'hsl', 'hsv']) {
      const row = document.createElement('div'); row.className = 'field'
      const label = document.createElement('label'); label.textContent = format.toUpperCase(); label.htmlFor = 'value-' + format
      const input = document.createElement('input'); input.readOnly = true; input.id = label.htmlFor; input.value = view.color[format]
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy'; copy.setAttribute('aria-label', 'Copy ' + format.toUpperCase())
      copy.onclick = () => run(async () => {
        await api.copy(format)
        byId('status').setAttribute('role', 'status')
        byId('status').textContent = `${format.toUpperCase()} copied: ${view.color[format]}`
      })
      row.append(label, input, copy); byId('fields').append(row)
    }
    if (view.error) report(new Error(view.error))
    byId('repick').focus()
  } else {
    document.body.classList.add('overlay'); byId('overlay').hidden = false
    const image = new Image()
    image.src = view.image
    await image.decode()
    const canvas = byId('desktop'), context = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    context.drawImage(image, 0, 0)
    image.src = ''; view.image = ''
    const zoom = byId('zoom').getContext('2d'), lens = byId('lens')
    zoom.imageSmoothingEnabled = false
    const pixel = event => {
      const bounds = canvas.getBoundingClientRect()
      const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width)))
      const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height)))
      const data = context.getImageData(x, y, 1, 1).data
      return { x, y, hex: '#' + Array.from(data.slice(0, 3), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase() }
    }
    canvas.onpointermove = event => {
      const picked = pixel(event)
      lens.hidden = false
      lens.style.left = Math.max(0, Math.min(innerWidth - 132, event.clientX + 24)) + 'px'
      lens.style.top = Math.max(0, Math.min(innerHeight - 162, event.clientY + 24)) + 'px'
      byId('hover-hex').textContent = picked.hex
      zoom.clearRect(0, 0, 126, 126)
      zoom.drawImage(canvas, picked.x - 4, picked.y - 4, 9, 9, 0, 0, 126, 126)
      zoom.strokeStyle = '#ffffff55'; zoom.lineWidth = 1
      for (let i = 0; i <= 9; i++) { zoom.beginPath(); zoom.moveTo(i * 14, 0); zoom.lineTo(i * 14, 126); zoom.stroke(); zoom.beginPath(); zoom.moveTo(0, i * 14); zoom.lineTo(126, i * 14); zoom.stroke() }
      zoom.strokeStyle = '#0a84ff'; zoom.lineWidth = 2; zoom.strokeRect(56, 56, 14, 14)
    }
    canvas.onpointerdown = event => { if (event.button === 0) void run(() => api.select(pixel(event).hex)) }
  }
  await api.ready()
}
void init().catch(async error => { report(error); try { await api.close() } catch { /* owner already closed */ } })
