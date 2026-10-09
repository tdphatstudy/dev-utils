export interface OfflineLicenseClaims {
  readonly version: 1
  readonly product: 'com.devutils.app'
  readonly id: string
  readonly edition: string
  readonly features: readonly string[]
  readonly issuedAt: number
  readonly notBefore?: number
  readonly expiresAt?: number
}
export const LICENSE_MAX_BYTES: number
export const LICENSE_DOMAIN: Buffer
export function validateLicenseClaims(value: unknown): OfflineLicenseClaims
export function verifyOfflineLicense(text: unknown, trustedPublicKeys: Readonly<Record<string, string>>, now?: number): OfflineLicenseClaims
