import { expect, it } from 'vitest'
import { parseSshKeyName } from './key-name'
it('rejects path injection and portable protected/reserved names while normalizing .pub', () => {
  for (const name of ['../key', 'folder/key', 'folder\\key', '.hidden', 'key.', 'CON', 'nul.txt', 'config', 'known_hosts.pub', 'authorized_keys', 'key.pub.pub', 'key.PUB.pub', 'x'.repeat(129)]) expect(() => parseSshKeyName(name)).toThrow()
  expect(parseSshKeyName(' id_ed25519_work.pub ')).toBe('id_ed25519_work')
})
