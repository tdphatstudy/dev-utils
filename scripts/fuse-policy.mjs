import { FuseVersion, FuseV1Options, FuseState, getCurrentFuseWire } from '@electron/fuses'

// Configure every supported fuse: an Electron upgrade adding fuses fails closed.
export const fusePolicy = {
  version: FuseVersion.V1,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  // The existing renderer uses file:// and offline workers/media. Disabling
  // this compatibility fuse breaks ASAR file loading in the native smoke.
  // Keep it until a separately tested custom renderer protocol replaces file://.
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
  [FuseV1Options.WasmTrapHandlers]: true
}
export async function verifyFuses(binary) {
  const wire = await getCurrentFuseWire(binary)
  for (const [option, enabled] of Object.entries(fusePolicy)) {
    if (!/^\d+$/.test(option)) continue
    if (wire[option] !== (enabled ? FuseState.ENABLE : FuseState.DISABLE)) throw new Error(`Packaged Electron fuse ${FuseV1Options[option]} did not match the required policy.`)
  }
}
