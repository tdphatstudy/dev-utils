export type KeygenAlgorithm =
  | 'rsa'
  | 'ec-p256'
  | 'ec-p384'
  | 'ec-p521'
  | 'ed25519'
  | 'x25519'

export interface KeygenRequest {
  algorithm: KeygenAlgorithm
  /** RSA modulus length */
  modulusLength?: 2048 | 3072 | 4096
  /** OpenSSH public key comment */
  comment?: string
}

export interface KeygenResult {
  algorithm: KeygenAlgorithm
  privateKeyPem: string
  publicKeyPem: string
  /** OpenSSH one-line public key when supported; null for X25519 */
  publicKeyOpenSsh: string | null
  fingerprintSha256: string
  fingerprintHex: string
  /** Human label e.g. RSA 2048, Ed25519 */
  label: string
}
