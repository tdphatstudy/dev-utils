# Tool UX audit and delivery checklist

Scope: all 33 registered tools in `src/renderer/src/registry/tools.ts`, including
settings and privacy. A source review or a passing unit test alone is not a
completed UX review. Keep this list current across changes.

Acceptance per tool:

- Core action produces correct output for typical, empty and malformed input.
- Errors explain how to fix the input; structured editors locate the error.
- Async work shows progress, hides stale output and cannot publish an old request.
- Copy/save/export acts on the current successful result; failures are visible.
- Keyboard labels and narrow desktop windows remain usable; content can scroll.
- Mode switches preserve inputs or explicitly use output for the next action.
- Sensitive payloads stay out of generic drafts/history. Local operations remain local.
- Domain regression tests and actual renderer interactions verify changed behavior.
- Native tools also need bridge/OS checks; a browser preview cannot prove these.

## Inventory (2026-10-04)

“Updated” below describes changes delivered so far, not completion of the whole
audit. “Pending” items remain part of the original request.

| Tool | Evidence / changes so far | Remaining review / verification |
|---|---|---|
| JSON Studio | Updated: deterministic line/column/hints, editor highlight/jump, null tree, import/export, safe special keys. Parser tests; renderer malformed/null smoke. | Draft restore/navigation, file actions, narrow layout |
| JSON Diff | Updated: raw/format toggle, swap/sample, copy actual diff, bounded large-input comparison; domain tests | Renderer modes, large output rendering/navigation |
| JSONPath | Updated: escaped/special keys, negative indexes, result modes, no-match feedback; domain tests | Renderer interactions and narrow layout |
| YAML Studio | Updated: comment/anchor preservation, explicit lossy normalization, cyclic/nonfinite JSON guard; domain tests | Renderer YAML/comment/cycle flows |
| YAML Diff | Updated: raw default, formatting toggle, safe tree conversion, bounded diff | Renderer mixed-mode flows and large output |
| HTML Studio | Updated: mixed/raw text preserved, structural error locations, static sandboxed preview. 12 tests + browser mismatch/script-blocked smoke. | Narrow layout and file actions; structural checking is not full HTML conformance |
| XML Studio | Updated: quoted tags, root/attribute validation, mixed/CDATA/space preservation, browser entity validation and error locations. 22 tests + Chromium mismatch/unknown-entity smoke. | Narrow layout and file actions |
| SQL Studio | Updated: literal/comment-safe minify, structured locations, honest Oracle validation limit; domain tests | Renderer dialect/error/file flows |
| Convert File Ext | Updated: shared diagnostics, YAML preservation and JSON representation checks; domain tests | Renderer swap/file/empty flows |
| Image Convert | Pending | Source, failures, image export fidelity, renderer |
| Base64 Encode / Decode | Updated: strict alphabet/padding, exact UTF-8/BOM, binary hex view, disabled reverse on errors/hex, file actions and neutral empty feedback. Domain tests + browser invalid UTF-8/hex smoke. | File import/download and narrow layout |
| Base64 Image | Updated: current-text preview in both modes, MIME signature/mismatch checks, bounded file reading, decoded dimensions, corruption feedback, copy/download gated on successful image decode. Domain tests + browser PNG/stale-preview smoke. | File chooser and native download; preview download event did not complete in browser automation |
| Secure Random | Updated: actionable no-alphabet error, disabled actions, wrapped output, accurate alphabet upper bound, integer checks and chunked Web Crypto. Domain tests + renderer no-alphabet smoke. | Narrow byte/UUID modes, crypto-unavailable error handling |
| Key Generator | Updated: async Node key generation, strict sizes/comments, no stale result across parameter changes, busy controls, private reveal/clear, SPKI vs OpenSSH fingerprints and guarded IPC. Signing/X25519 tests; RSA 4096 yields the event loop. Browser RSA/bits and desktop-required smoke at 720×500. | Native renderer generation/copy flows and narrow result layout; encrypted saving depends on vault safety review |
| Hash | Updated: current-input async results, pending/failed feedback, wrapped digest and UTF-8 byte count. Independent digest vectors + browser MD5/copy-pending check. | Narrow layout and save flow |
| HMAC | Updated: no stale MAC, explicit missing key, show-secret toggle and connected label. Independent HMAC vectors + renderer missing-key smoke. | Renderer algo/format switching and narrow layout |
| JWT | Pending | Decode vs verify distinction, malformed payload, async verification |
| AES-GCM | Updated: stale-result invalidation, explicit empty-result success, password labels/reveal, reverse-output and shortcut. Roundtrip/wrong-key/tamper tests + browser roundtrip, wrong-key, empty-plaintext and Ctrl+Enter smoke. Narrow 720×600 footer verified visible after scroll fix. | Edit-during-operation case |
| URL Tools | Updated: preserves special query keys, component/URL/form modes, actionable escaping errors, reverse-output, no generic history. Tests + renderer plus/percent cases. | Parse special keys and narrow layout in renderer |
| IP / CIDR | Updated: strict IPv4/IPv6, embedded IPv4, expanded loopback/link-local; real subnet mask/endpoints; separate mode inputs. 27 domain cases + browser subnet/mode-preservation smoke. | Narrow layout, clear/malformed renderer states; IPv6 CIDR explicitly unsupported |
| DNS Lookup | Updated: numeric-label/IDNA normalization, length validation, guarded single-job IPC, hard deadline, actionable DNS failures, TTL, SRV/SOA/PTR, samples/help and response timing. 49 domain/service tests + real resolver/UDP loopback integration. Browser invalid path, URL/IDNA, PTR and 720×500 feedback verified. | Actual Electron bridge run/loading/empty/copy flows; macOS/Linux native smoke |
| HTTP Client | Updated: guarded request/cancel jobs, streaming 5 MB cap, timeout selection, raw/format response preserving JSON lexemes, lossless binary Base64, JSON body locations, duplicate params, genuine multipart text fields, frozen request controls and stale-result clearing. Real local HTTP tests; fetch/Axios config execution and PowerShell/Bash stubs prove quoting/body handling. | Renderer params/form/code/narrow flows; actual Electron request/cancel/save/copy; Go/Java/HTTPie/Python runtime checks; multipart file uploads unsupported |
| Port Manager | Existing review identified Linux/macOS parsing defects | Fix adapters, empty/loading/error UX, native smoke |
| SSH Keys & Hosts | Existing review identified lossy config rewrite; privacy denylist updated | Lossless edits, key creation, save/permissions, native smoke |
| File Hash | Updated: fixed 64 KB streaming, changed-file rejection, guarded IPC, byte progress, real abort and unmount cancellation, stale-copy suppression, accessible picker, recheck and checksum comparison. Domain/native-service tests + browser desktop-required and 720×500 scroll/footer smoke. | Actual Electron picker/algorithm/progress/cancel/error flows |
| Line Endings | Updated: separate CRLF/LF/CR counters, mixed feedback, selected-ending export, final newline preservation; 9 tests | Renderer import/export and narrow layout |
| Regex Tester | Pending | Invalid patterns, zero-length matches, slow expressions, replacement |
| Cron Calculator | Pending | Syntax dialect, timezone, next runs, empty/errors |
| QR Code | Pending | Encode limits, image decode, stale previews, export |
| Private Box | Existing review identifies metadata/key/deletion/path safety risks | Core data-safety fixes and complete native UX flows |
| Keep | Privacy denylist updated | Save/recovery/unlock conflicts, empty/search/edit UX |
| Settings | Pending | Preferences and platform paths, errors, keyboard navigation |
| About & Privacy | Pending | Accurate capabilities/privacy/runtime documentation |

## Shared delivery evidence

- First batch `bc8295f`: typechecks and production build passed. 165 tests passed
  under default timing; the existing expensive vault verifier test passed separately
  with a 30-second command-line timeout. Default 5-second timeout remains unchanged.
- Second batch: final full suite 226 tests across 33 files passed with
  `--maxWorkers=1 --no-file-parallelism --testTimeout=30000`. Both typechecks and
  the final production build passed. The existing 2.9 MB SQL vendor bundle warning
  remains. Default test timeout in repository configuration is unchanged.
- Browser preview runs the real renderer with Web Crypto, without an Electron
  bridge. It proves local renderer behavior only, not OS dialogs, IPC or installers.
- File Hash follow-up: both typechecks and production build passed. Full suite
  passed 263 tests; additional real in-read append/timestamp cases passed separately.
  Four algorithms matched independent 2 MB binary digests, including chunk boundaries.
  Actual Electron dialog and UI/service integration remain unverified in this preview.
- File Hash progress/cancel and Key Generator: full suite passed 279 tests across
  38 files with the same serial/30-second command options, both typechecks and build
  passed. Abort before reading and between chunks, cancel ownership/job cleanup,
  signing with all five signing algorithms, X25519 agreement and RSA event-loop
  responsiveness are covered. Subsequent SSH exclusive-write/fingerprint tests
  passed separately; Windows ACLs and macOS/Linux native smoke are not proven.
- DNS follow-up: full suite passed 330 tests across 42 files using the serial/
  30-second command options; both typechecks and production build passed. Real
  Node resolver against a local UDP DNS fixture proved TTL, TXT chunks, reverse
  lookup and NXDOMAIN. No external DNS server was required for these checks.
- HTTP follow-up: full suite passed 353 tests across 46 files; both typechecks
  and the final production build passed. A real local
  HTTP server covered 422 bodies, 204/HEAD, binary/BOM preservation, response cap,
  timeout, active cancellation, duplicate query and multipart fields. PowerShell
  and Git Bash exports executed against stubbed commands with no external requests.
  Go and Java compilers were unavailable; their generated exports are not compile-proven.

Next: finish outstanding renderer checks for these changes, then review the
remaining native tools, images/text tools and vault/Keep. Do not mark
the full task complete until every inventory row has implementation and direct
verification evidence or an explicitly reported environment limitation.
