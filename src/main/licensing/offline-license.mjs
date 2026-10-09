import { createPublicKey, verify } from 'node:crypto'

export const LICENSE_MAX_BYTES = 16 * 1024
export const LICENSE_DOMAIN = Buffer.from('DevFusion offline license v1\0', 'utf8')
const PRODUCT = 'com.devutils.app'
const slug = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const token = (value, maximum) => typeof value === 'string' && value.length <= maximum && slug.test(value)
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= 253402300799

export function validateLicenseClaims(value) {
  const fields = ['version', 'product', 'id', 'edition', 'features', 'issuedAt', 'notBefore', 'expiresAt']
  if (!record(value) || Object.keys(value).some(key => !fields.includes(key)) || value.version !== 1 || value.product !== PRODUCT ||
      !token(value.id, 128) || !token(value.edition, 32) || !timestamp(value.issuedAt) || !Array.isArray(value.features) ||
      value.features.length > 32 || value.features.some(feature => !token(feature, 64)) || new Set(value.features).size !== value.features.length ||
      (value.notBefore !== undefined && (!timestamp(value.notBefore) || value.notBefore < value.issuedAt)) ||
      (value.expiresAt !== undefined && (!timestamp(value.expiresAt) || value.expiresAt <= (value.notBefore ?? value.issuedAt)))) {
    throw new Error('Invalid offline license claims.')
  }
  return Object.freeze({ ...value, features: Object.freeze([...value.features]) })
}

function decode(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum * 2 || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid offline license encoding.')
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length > maximum || bytes.toString('base64url') !== value) throw new Error('Invalid offline license encoding.')
  return bytes
}

/** Trust keys supplied by main/release code, never a key embedded in a license or settings. */
export function verifyOfflineLicense(text, trustedPublicKeys, now = Math.floor(Date.now() / 1000)) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > LICENSE_MAX_BYTES || !timestamp(now)) throw new Error('Invalid offline license.')
  let envelope
  try { envelope = JSON.parse(text) } catch { throw new Error('Invalid offline license.') }
  if (!record(envelope) || Object.keys(envelope).sort().join(',') !== 'keyId,payload,signature,version' || envelope.version !== 1 || !token(envelope.keyId, 64) ||
      !record(trustedPublicKeys) || !Object.hasOwn(trustedPublicKeys, envelope.keyId)) throw new Error('Untrusted offline license issuer.')
  const payload = decode(envelope.payload, 8 * 1024), signature = decode(envelope.signature, 64)
  if (signature.length !== 64) throw new Error('Invalid offline license signature.')
  try {
    const pem = trustedPublicKeys[envelope.keyId]
    if (typeof pem !== 'string' || pem.length > 1024 || !pem.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error()
    const key = createPublicKey(pem)
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.concat([LICENSE_DOMAIN, payload]), key, signature)) throw new Error()
  } catch { throw new Error('Invalid offline license signature.') }
  let value
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload)) } catch { throw new Error('Invalid offline license claims.') }
  const claims = validateLicenseClaims(value)
  if (claims.issuedAt > now + 300 || (claims.notBefore !== undefined && claims.notBefore > now)) throw new Error('Offline license is not valid yet.')
  if (claims.expiresAt !== undefined && claims.expiresAt <= now) throw new Error('Offline license has expired.')
  return claims
}
