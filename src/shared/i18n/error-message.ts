/** Remove Electron's transport prefix from a user-facing operation error. */
export function interfaceErrorMessage(error: unknown, fallback = 'The action failed. Try again.'): string {
  if (!(error instanceof Error)) return fallback
  const message = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').trim()
  return message || fallback
}
