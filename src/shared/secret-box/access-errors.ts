/** Electron invoke errors may prefix the service message and lose its custom name. */
export function isVaultAccessError(error: unknown): boolean {
  return error instanceof Error && (['NEEDS_ACCESS', 'SESSION_CHANGED'].includes(error.name) || /\b(?:NEEDS_ACCESS|SESSION_CHANGED)\b/.test(error.message))
}
