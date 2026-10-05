export function sshKeyNameError(name: string): string | null {
  const base = name.trim().replace(/\.pub$/i, '')
  if (/\.pub$/i.test(base)) return 'Use only one optional .pub suffix; the private key filename cannot end in .pub.'
  if (!base || base.length > 128 || base.startsWith('.') || base.endsWith('.') || !/^[A-Za-z0-9._@+-]+$/.test(base)) {
    return 'Use a key filename up to 128 characters: letters, digits, . _ @ + -. No paths or leading/trailing dot.'
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) return 'This filename is reserved on Windows. Choose another name.'
  if (/^(?:config(?:\.bak)?|known_hosts(?:\.old)?|authorized_keys(?:2)?|authorized_keys\.bak)$/i.test(base)) return 'This is a protected SSH filename. Choose a key name.'
  return null
}

export function parseSshKeyName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('Key name must be text.')
  const error = sshKeyNameError(name)
  if (error) throw new Error(error)
  return name.trim().replace(/\.pub$/i, '')
}
