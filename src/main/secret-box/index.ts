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
} from './crypto'

export {
  loadOrCreateDeviceSecret,
  resolveDeviceKeyA,
  listDeviceKeyCandidates,
  resolveDeviceKeyAForSetup
} from './device-secret'
export { resolveHardwareDeviceSecret, collectMachineIdParts } from './machine-id'
export { atomicWriteFile } from './atomic-write'

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
  getDefaultVaultEntry,
  isPutlFile,
  readVaultConfig
} from './vault'

export { clearAccess, getAccess, requireAccess, setAccess } from './session'

export * as boxFs from './fs-ops'
export * as boxIo from './export-import'
export { registerSecretBoxIpc, registerPrivateBoxIpc } from './ipc'
