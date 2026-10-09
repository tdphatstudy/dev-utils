# Release-readiness fixes — 2026-10-09

This records fixes for the eleven findings in the
[release-readiness review](release-readiness-review-2026-10-09.md). The review is a
historical baseline; its failed checks are not current passing results. Unrelated
pre-existing workspace changes were preserved. No vault migration, telemetry,
activation policy, signing credentials or paid feature gate was introduced.

## Changes

| Finding | Resulting behavior |
| --- | --- |
| 1. Draft lost on navigation/close | Route/file guards offer save, discard or cancel. Reload is blocked while work is unsaved; native close offers Keep editing or Close without saving. Failed saves and edits during a save remain protected. |
| 2. Draft replaced by file actions | Same-file Open focuses the editor. New/Open/Delete/Sign out check unsaved changes. Rename updates metadata while preserving the draft; binary encoding/MIME survives rename. |
| 3. Windows without WMIC | Fixed CIM fallback reads the same identity properties. Any useful legacy WMIC result remains unchanged to preserve existing fingerprints. |
| 4. AppImage search-path advisory | electron-builder upgraded from 25.1.8 to 26.15.3, including the patched AppImage builder. |
| 5. SQL blocking input | Debounced validation and explicit formatting run in cancellable workers, with time, size and complexity limits. |
| 6. Media blocked by CSP | Local blob audio/video playback is permitted; viewer cleanup revokes URLs. External media schemes remain restricted. |
| 7. OCR pointer interference | One primary pointer owns the crop gesture; unrelated pointers, cancellation and lost capture cannot replace it. |
| 8. Interface language gaps | Added full catalog translations, source integration and dynamic messages; localized command search and quick-window language updates are included. |
| 9. Clipboard polling cost | Adaptive polling stops when disabled, paused, the screen is locked or a vault is unlocked; it skips unchanged eligible hashing and streams ignored-content fingerprints. Automatic capture continues in tray while enabled. |
| 10. Dependency advisories | Upgraded pinned packages, applied compatible patched overrides and two reviewed local patches; added a fail-closed audit gate to quality and signing CI. |
| 11. Environment Ctrl+Enter | ToolTextInput forwards the existing high-priority editor run command; both comparison inputs invoke analysis. |

The source changes keep renderer/main/shared boundaries and named preload methods.
New domain modules separate Windows identity collection, clipboard fingerprinting,
SQL admission limits/worker jobs and translation metadata. Existing comments with
compatibility or security meaning are retained; stale claims were corrected.

Final validation found three additional defects: empty/generic firmware identity
could produce a shared fingerprint, the native close warning ignored the current
language, and subscription cleanup returned an Electron IPC object through the
context bridge. Empty identities are rejected, the warning follows the locale,
and all workspace/quick-window cleanup functions return void and support repeated
unsubscribe calls.

## Dependency patch maintenance

`pnpm security:audit` accepts only these exact locally mitigated advisories after
checking package/lockfile references, patch hashes and installed-file hashes:

- `braces@3.0.3`: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), bounded parse/AST depth, node count and cycle checks before recursive processing.
- `sprintf-js@1.1.3`: [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), bounded format, width and precision before allocation.

The ordinary formatter/glob cases and abuse cases have regression tests. Raw
`pnpm audit` still reports those two upstream advisories; the release gate reports
verified local mitigations, rather than claiming an empty raw audit. Exceptions
expire at **2026-11-09 00:00 UTC**. Replace patches with upstream releases when
available, rerun fixtures, and explicitly review any extension of that deadline.

## Verification

Checks ran locally on Windows, with Node 20.19.5, pnpm 10.33.4 and Electron
44.5.1. Browser/native fixtures use temporary profiles or RAM-only state; they do
not write the user's vault, clipboard, hosts file or SSH configuration.

| Check | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS, including postinstall native dependency rebuild. |
| `pnpm typecheck`, `pnpm build` | PASS after all preload cleanup fixes. Renderer chunks retain the size warning described below. |
| `pnpm test --maxWorkers=4` | PASS, 132 files / 1,141 tests after final source changes. |
| `pnpm security:audit` | PASS, two verified local mitigations; raw audit retains one high and one moderate upstream advisory. Focused audit/patch checks: 7 passed. |
| `pnpm test:i18n:coverage` | PASS, 2,414 interface source occurrences and 2,188 unique catalog rows, with 13-language/placeholder contracts. |
| `pnpm test:ui:release` | PASS, Private Box route/file guards, failed/in-flight save protection, WAV/WebM blob playback and cleanup, actual bounded SQL worker/debounce/cancellation. |
| `pnpm test:ui:enterprise` | PASS, comparison Ctrl+Enter, privacy redaction, vault-lock recovery, advanced worker bounds/cleanup and reduced-motion/theme controls. |
| `pnpm test:ui:security-testing` | PASS, consent, bounded live candidates, masking, stop/navigation cleanup and request/report privacy. |
| `pnpm test:ui:i18n` | PASS, all 13 locales through settings, security/schema, About, conversion/copy, SQL, Private Box and Keep; code, keys, passwords and unsaved input preserved. |
| `node tests/ux-review-ui.smoke.mjs` | PASS, 51 tool routes in both themes at 1180×760 and 720×500, control overflow, contrast, focus, window labels and favorite round-trip. |
| `node tests/quick-tools-ui.smoke.mjs` | PASS, language/context race, live notices, preserved OCR/QR/YAML, compact layouts, lazy tools and no remote requests. |
| `node tests/electron-quick-tools.smoke.mjs` | PASS, sandboxed native bridge, all 13 live locales, RTL/LTR, malformed event refusal, repeated unsubscribe, pin/input preservation, no idle renderer allocation and temporary encrypted history. |
| Native security / draft / packaged-security smoke commands | PASS, IPC sender/payload policy, navigation/permissions, vault suspension/recovery, forced renderer crash, dirty close/reload and packaged fuse policy. |
| `pnpm test:electron:protection` | PASS, actual final production bytecode/preloads, all ten workspace subscription cleanup methods, localized native close, offline widget/helpers and four native/verifier tamper refusals. |
| `pnpm exec electron-builder --dir --publish never` and `pnpm verify:package release/win-unpacked/DevFusion.exe` | PASS, final unsigned Windows directory package, security fuses, embedded ASAR header and every file/block hash. |
| Source/docs/workflows | PASS, diff whitespace, changed smoke syntax, workflow YAML and local document links. |

The protection and packaged-security fixtures set their own project directories,
preventing electron-builder from collecting workspace-wide fixture dependencies.
Intentional unsupported IPC targets are refused and logged during negative tests.
An earlier packaged-security fixture emitted GPU/cache-lock diagnostics while its
assertions passed; these logs do not qualify the driver/device matrix. The final
isolated production protection and quick-window runs also passed.

Windows without WMIC was exercised on the current host through CIM; adapter
fixtures cover legacy partial values, NUL/generic values and malformed/oversized
outputs. Focused identity/vault-preservation checks: 18 passed. No hardware IDs
were printed and existing vault metadata/device secrets remain preserved.

Clipboard fingerprint benchmark (12 samples, 256 KiB text + 256 KiB HTML + 4 MiB
PNG): median **29.82 → 6.89 ms**, p95 **37.99 → 8.66 ms**. This excludes native
clipboard reads and image encoding and does not establish idle CPU or total RAM.

## Remaining release qualification

The code findings can be fixed on this host; physical and commercial release QA
has separate limits. No signed installer, macOS/Linux native run, physical touch/
pen, mixed-DPI multiple monitors, hotplug, remote desktop, antivirus/EDR or unusual
driver matrix has been exercised here. CI contains the desktop OS matrix, but a
configured workflow is not evidence that a remote run passed. Follow the hardware
and software matrix in the review before declaring those platforms qualified.

All 13 locales have source/catalog contracts and representative runtime checks.
Professional native-speaker editing, screen-reader testing and long-form layout
review remain release QA; automated checks cannot certify every translated phrase.

The shared renderer chunk is **1,341.04 kB minified**, including the bundled
13-language catalog, and exceeds the 900 kB warning threshold. Tool/parser/model
loading remains lazy, but the catalog is still eager. No packaged-app idle CPU/RAM
budget, cold/warm startup p95 or repeated-cycle memory baseline was established;
the clipboard microbenchmark alone cannot establish whole-app performance.
Source-wide comment removal and a new formatter/lint/dependency-boundary gate were
not part of the eleven code-defect fixes. Meaningful security/compatibility
comments are retained. Linux AppImage execution/search-path qualification still
requires a Linux build and smoke despite the patched builder version.

Bytecode, fuses and ASAR integrity raise the cost of alteration, but cannot make a
local executable impossible to crack. Signed distribution and a defined licensing
policy are still needed for paid distribution. License enforcement must preserve
the user's access to their own vault, recovery and exports.
