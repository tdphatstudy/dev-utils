# Lightweight application protection

Implemented 2026-10-09. DevFusion remains local-first. These controls add no
activation server, telemetry, background protection service, native anti-cheat
module or periodic full-package scan to the running application.

## Build and tamper controls

Production `pnpm build` compiles the main bundle to Electron-compatible V8
bytecode with the already installed electron-vite plugin. `out/main/index.cjs`
is a small bootstrap; `index.cjsc` holds the main implementation. Original main
JavaScript and source maps are not distributed. The plugin transforms arrow
functions; class fields are lowered first for electron-vite 2 compatibility.
Development builds retain ordinary JavaScript and debugging.

Renderer code remains minified JavaScript with lazy chunks. Preloads remain
small standalone CommonJS bundles because bytecode preloads would require
disabling Electron's sandbox. Every production window disables DevTools while
keeping sandbox, context isolation and web security enabled. This removes a
convenient inspection entry point; it is not a cryptographic boundary.

Color Picker and OCR helper HTML/JavaScript, including the logo used by those
pages, now ship under `app.asar/out/main/helpers`. Packaged helper lookup uses
only that directory and refuses external fallbacks. Ordinary menu/tray icons
remain outside the archive; no executable helper is loaded from extraResources.

Before packing, the build gate requires bytecode, its exact bootstrap, required
helpers and the same Electron version, OS and CPU architecture as the build
machine. It rejects source maps, source backups and signing-key file extensions
inside output. A dev build or a bytecode compiler silently producing empty output
fails packaging. Bytecode is not portable across arbitrary V8/architecture
combinations: rebuild on every target instead of reusing `out` from another job.

`afterPack` still embeds the Windows product icon and applies/reads back the
existing fuse policy. It additionally verifies the executable's embedded ASAR
header hash on Windows, or `Info.plist` integrity entry on macOS, then streams
each packed file and checks whole-file and block hashes. The same check runs
after signing and through `pnpm verify:package <exe-or-app>`. Unpacked application
files and ASAR links fail this policy until explicitly secured separately.
The full scan occurs during packaging/verification, not app startup. Electron
checks integrity as packaged files are read at runtime.

The standard distribution command now builds for the host platform. macOS
defaults to the host architecture; signed CI has separate Intel and Apple
Silicon jobs. Build on Windows for Windows, macOS for macOS, Linux for Linux.
GitHub runner architecture labels are taken from its
[hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Electron runtime embedded ASAR enforcement supports Windows and macOS.
Linux gets bytecode, fuses and build-time hash verification, but the same runtime
tamper protection is not available. See
[Electron ASAR integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity).

## Offline license foundation

`src/main/licensing/offline-license.mjs` provides a bounded, Node-only verifier,
with TypeScript declarations. It is ready for future licensing integration;
current tools have no new activation UI, premium gate or license requirement.
The module is not imported by the current main entry and therefore does not add
runtime licensing work to existing users.

Licenses contain a versioned envelope with `keyId`, base64url payload and a
64-byte Ed25519 signature. The signature covers a product/protocol domain prefix
and the exact payload bytes. Claims bind product `com.devutils.app`, license ID,
edition, feature IDs and issue time; validity/expiry are optional, so perpetual
offline licenses are supported. Input is at most 16 KiB. Unknown claims,
versions, issuers, algorithms, duplicate features, malformed encodings, altered
entitlements and bad signatures are refused. Verified claims/features are frozen.

Trusted public keys must come from main/release code. A license, renderer request
or preference file must never supply its own trusted issuer key. Ship only public
keys. Keep issuer private keys on an owner-controlled offline machine or secure
signing system outside the repository, release artifacts and user settings.
No issuer key is generated or committed by this change.

The owner-only issuance CLI accepts an existing external Ed25519 private PEM,
validated claims JSON, key ID and an output path. It refuses replacing existing
files and bounds input size. Example, with an already provisioned external key:

```powershell
pnpm license:issue --private-key C:/LicenseKeys/devfusion-issuer.pem --claims C:/LicenseKeys/claims.json --output C:/LicenseKeys/customer.license --key-id issuer-2026
```

Example perpetual claims:

```json
{"version":1,"product":"com.devutils.app","id":"customer-001","edition":"pro","features":["ocr"],"issuedAt":1791504000}
```

When monetization is defined, add manual license-file import through a named,
validated main IPC handler; persist only the signed envelope atomically. Reverify
it against compiled public keys at startup/import and enforce each entitlement
in its privileged main operation. Renderer flags should display the result only.
Do not couple license failure to vault decryption, recovery, backups or exporting
the user's own data. Do not store an `isPro` boolean as the authority. The current
MIT package metadata is preserved; product licensing terms are a separate choice.

Rotate issuer keys using distinct IDs and a reviewed signed release containing
the new public key. Retire a compromised ID in future releases. A permanently
offline installation cannot receive immediate revocation, prevent copying a
valid transferable license, or reliably detect a rolled-back system clock.
These claims do not promise those properties. Avoid inventing a machine binding,
activation counter or expiration policy before the product policy is chosen.

## Limits and release procedure

Bytecode raises the effort needed to inspect the main implementation; literals
and runtime values can still be extracted. Renderer source is recoverable.
Someone controlling the executable and machine can patch a license check or
replace an unsigned binary and its embedded integrity hash. There is no absolute
offline anti-crack guarantee. Keep vault encryption independent of source
protection; hiding code is not a place to hide vault or issuer secrets. See the
[electron-vite protection guidance](https://electron-vite.org/guide/source-code-protection).

Authenticating the executable requires a trusted signed distribution. Existing
`dist:win:signed` / `dist:mac:signed` profiles require signing/notarization
credentials and run verification after signing. No real certificate or signed
artifact was available locally. OS verification and a trusted download channel
remain essential; fuses cannot authenticate an unsigned replacement executable.

Before release, run tests, typecheck, build, native protection smoke and installer
smokes on every target. Keep a known-good signed installer and encrypted-data
backups. On integrity failure, replace the installation from a verified artifact;
do not loosen fuses or recreate user vault keys. Roll back binaries only across
compatible vault formats. This change does not migrate user data.

`pnpm test:electron:protection` packages a temporary fixture containing actual
production bytecode and renderer/preloads, with an isolated profile and fake
clipboard. It probes workspace IPC, clipboard widget and both helper pages while
blocking/counting HTTP requests, then modifies main bytecode, both helper scripts
and the ASAR header one byte at a time. Windows/macOS must refuse modified files
in native Electron; Linux asserts only the build verifier. The fixture bootstrap
is instrumentation, so this does not certify the complete signed installer.

Local Windows checks: 122 test files / 1,096 tests passed, full TypeScript checks
passed, production build passed, and a separate unsigned directory package
passed pre-pack/fuse/embedded-header/file/block verification. The main bootstrap
is 73 bytes; main bytecode is 1,043,000 bytes in this build. No runtime performance
baseline or broad idle-memory benchmark was measured for this change.

Native protection smoke passed offline workspace/widget/helper probes and all
four tamper cases. The fixture does not ship a tray icon and could not read a
hardware ID for default device-vault creation; neither is counted as validated
by that fixture. Portable-vault preservation, crypto and hardware-ID parsing
have unit coverage in the full suite. No macOS/Linux native execution, installer
upgrade test, real code signing/notarization or CI run was performed here.
