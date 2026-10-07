# Enterprise desktop delivery

## Build profiles

Use Node 22.12 or later in the Node 22 line and pnpm 10.33.4 from `packageManager`.
Install with `pnpm install --frozen-lockfile`. Playwright and `@electron/fuses`
are pinned development dependencies; the application has no new runtime dependency.

The ordinary `pack` / `dist:*` commands remain local, unsigned build commands.
`pnpm dist:win:signed` and `pnpm dist:mac:signed` use
`electron-builder.signed.yml`, fail without credentials, require code signing,
and never publish automatically. Build macOS artifacts on macOS.

`after-pack.mjs` applies and reads back every supported Electron fuse before
signing. Run-as-Node, Node environment options and CLI inspection are disabled;
cookie encryption, ASAR-only entry loading and embedded ASAR integrity validation
are enabled. New Electron fuse definitions fail the build until reviewed.
Embedded ASAR validation applies on Windows/macOS; do not claim the same OS
enforcement on Linux. Signed builds verify fuses again after signing.

The existing renderer uses `file://` for offline content and workers. Its file
protocol compatibility fuse stays enabled: disabling it failed the Windows ASAR
native smoke even though the HTML was present. CSP, navigation, permissions,
sandbox and IPC guards stay restricted. A future custom renderer protocol needs
its own resource allowlist and media/worker tests before removing compatibility.
See [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses).
Fuses and ASAR hashes alone do not authenticate an unsigned executable or protect
every external resource/profile file from someone who can replace them.

## CI and signed artifacts

`quality.yml` checks Windows, macOS and Linux using frozen dependencies,
TypeScript, all unit tests, the production build, browser flows, native security
smoke and a temporary ASAR smoke package using the production fuse policy.
The latter runs with hostile `ELECTRON_RUN_AS_NODE`/`NODE_OPTIONS` environment
values to verify those hooks are ignored. It uses a separate fixture main and
temporary profile; it is not a complete test of the signed installer, tray,
capture helpers or every platform adapter.
The ephemeral Ubuntu runner permits unprivileged Chromium sandbox namespaces;
this changes its AppArmor namespace restriction for the CI job only. Application
sandboxing remains enabled, and the tests do not use `--no-sandbox`.

`signed-build.yml` is manually dispatched. Configure the GitHub environment
`desktop-release` with required reviewers, trusted refs and these secrets:

| Platform | Environment secrets |
| --- | --- |
| Windows | `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD` |
| macOS | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` |

CSC links can contain the signing certificate in the format electron-builder
accepts. Keep them in the protected release environment. The workflow writes the
Apple API key only to a temporary file with mode 0600 and removes it on exit.
Do not put signing keys, passwords or notarization credentials in the repository,
workflow output, application preferences or diagnostic attachments.

The Windows job rejects invalid Authenticode signatures. The macOS job checks
both architectures with `codesign`, Gatekeeper and stapled notarization tickets.
Artifacts and streaming SHA-256 manifests are retained for review; nothing is
published, installed or deployed by these workflows. No credentials, signed
artifacts, GitHub runs or macOS/Linux native execution were available during this
Windows implementation session.

## Rollout and recovery

1. Require green quality checks for the exact revision, then dispatch the signed
   artifact workflow on an approved ref. Record version, revision and hashes.
2. Verify signature and checksum after downloading. Run installer/upgrade/uninstall
   and real desktop smoke checks on each supported OS, including offline tools,
   workers, OCR/color permissions, tray, vault unlock/recovery and idle/suspend.
3. Back up encrypted vault folders and recovery material. Do not export plaintext
   as an automatic rollout step. Restore a backup into a separate folder and
   prove unlock/read with the original keys before broad distribution.
4. Pilot with a small group. Distribute through the organization's signed software
   channel only after reviewing failures. Keep the previous verified signed
   installer and backups for rollback; avoid downgrades across incompatible vault
   formats. This change does not migrate the vault format.
5. Stop rollout on data loss, unlock/recovery regressions, invalid signatures or
   platform crashes. Lock boxes, preserve encrypted files and collect only
   redacted diagnostics. Return to the verified version with a supported backup
   rather than recreating salts/device secrets or deleting vault metadata.

There is no automatic updater or remote update-verification service in this
implementation. Updates are manual, signed distributions. A manifest provides
corruption detection when delivered through a trusted channel; it is not an
independent signature. Enabling cookie encryption is a one-way profile change;
do not disable that fuse during rollback and assume the cookie database remains
readable. See the Electron fuse documentation above.

## Auto-lock and privacy

Main owns `security-policy.json`, containing only validated `idleMinutes`
(5/15/30/60, default 15). Idle checks run every ten seconds while a box is open.
OS suspend and reported screen-lock events invalidate authentication/IO sessions
and zero both main vault keys before notifying the renderer. Screen-lock events
depend on OS support; Linux deployments must verify their desktop integration,
with idle and suspend as the implemented fallback.

Private Box and Keep views remount after masking content and portalled dialogs.
Unsaved text documents, Keep edits and composers are captured into a separate
AES-256-GCM checkpoint in main RAM. Recovery requires the same webContents owner,
canonical box root and a current authenticated session. Restore returns the draft
to the editor without writing it to disk; the user reviews and saves explicitly.
Keep serialization preserves unknown fields in existing notes. An unresolved
checkpoint is retained across repeated OS locks. Window close guards warn about
protected drafts, and destroying the owner zeroes recovery key/ciphertext buffers.

The recovery limit is 72 MiB per capture and 144 MiB total, with at most sixteen
pending checkpoints. Capture failure keeps changes hidden in renderer RAM and
offers Retry or explicit Discard; it does not silently drop unsaved edits.
Closing the app or a process crash can lose RAM recovery. JavaScript strings
cannot be reliably overwritten; clearing the UI and references is not a guarantee
against memory inspection, OS swap, crash dumps or a compromised main process.

Settings → Security & privacy → Tool input retention → Off immediately clears
generic window drafts/history and rejects delayed writes. Current editors remain
open, then clear on tool navigation. Only the preference persists, with legacy
settings retaining This window behavior. Tool-ID preferences remain metadata;
the sensitive-tool denylist always applies. This is a local preference, not a
centrally enforced enterprise policy. Explicit encrypted saves and user-requested
plaintext exports remain separate actions.
