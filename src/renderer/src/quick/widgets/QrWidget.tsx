import { interfaceErrorMessage } from '@shared/i18n/error-message'
import { messageKey } from '@shared/i18n/message-key'
import { useEffect, useRef, useState } from 'react'
import { Copy, ImagePlus } from 'lucide-react'
import type { WidgetApi } from '@shared/quick-tools'
import { encodeQr, decodeQrFromFile } from '@shared/qr'
import { useWidgetFile } from './file-picker'

export default function QrWidget({ api, pinned, t }: { api: WidgetApi; pinned: boolean; t: (message: string) => string }): JSX.Element {
  const [text, setText] = useState(''), [image, setImage] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const fail = (value: unknown): void => setError(interfaceErrorMessage(value))
  const file = useWidgetFile(api, pinned, value => {
    const request = ++revision.current; setBusy(true); setError('')
    void decodeQrFromFile(value).then(result => { if (request === revision.current) { if (result.ok) setText(result.text); else setError(result.error) } }).catch(fail).finally(() => setBusy(false))
  }, fail)
  useEffect(() => {
    const request = ++revision.current; setImage(''); setError(''); setNotice('')
    if (!text) return
    const timer = setTimeout(() => { void encodeQr(text, { width: 256 }).then(result => { if (request === revision.current) { if (result.ok) setImage(result.dataUrl); else setError(result.error) } }).catch(fail) }, 120)
    return () => { clearTimeout(timer); revision.current++ }
  }, [text])
  return <div className="quick-card"><label>{t('Text or URL')}<textarea autoFocus maxLength={7089} rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="https://example.com" /></label>
    <div className="quick-qr">{image ? <img src={image} alt={t('Generated QR code')} /> : <p>{t('Type or paste to generate a QR code.')}</p>}</div>
    <div className="quick-actions"><button className="primary" disabled={!image || busy} onClick={() => { setBusy(true); void api.copyImage(image.split(',')[1]).then(() => setNotice(messageKey('Copied to clipboard.'))).catch(fail).finally(() => setBusy(false)) }}><Copy size={15} />{t('Copy QR image')}</button><button disabled={busy} onClick={file.choose}><ImagePlus size={15} />{t('Read QR image')}</button></div>
    <input ref={file.input} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" onChange={file.changed} />
    {error && <p className="clip-error" role="alert">{t(error)}</p>}<p role="status">{t(notice)}</p>
  </div>
}
