export {
  defaultSecretBoxPath,
  appDataRoot,
  secretBoxRegistryPath,
  deviceSecretPath,
  userDataRoot
} from './paths'

export {
  deriveLayerKeys,
  sealDoc,
  openDoc,
  parseEnvelope,
  serializeEnvelope,
  generateSalt,
  generateDeviceSecret,
  normalizeKeyPart
} from '../privatebox/crypto'

export { loadOrCreateDeviceSecret } from '../privatebox/device-secret'

export {
  getStatus,
  setupVault,
  accessVault,
  clearVaultAccess,
  setActiveVault,
  removeVaultFromList,
  renameVault,
  readRegistry,
  getActiveEntry,
  ensureDefaultSecretBox,
  getDefaultVaultEntry
} from '../privatebox/vault'

export { clearAccess, getAccess, requireAccess, setAccess } from '../privatebox/session'

export * as boxFs from '../privatebox/fs-ops'
export * as boxIo from './export-import'
