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

## UX foundation follow-up (2026-10-05)

The first priority batch protects Keep edits/new notes with explicit Save and
continue / Discard / Keep editing before route navigation, Sign out, editor close
or composer replacement. React Router still uses the existing hash URLs and lazy
registry, now through the data router so Back and programmatic navigation can be
blocked. A failed save leaves the draft available; active writes cannot be
discarded or cancelled through the guard. A beforeunload handler requests host
confirmation for reload/close, subject to Electron/browser behavior.

The shared Radix modal now contains/restores focus in Keep and vault naming.
Segmented controls support Left/Right/Home/End and a single Tab stop. JSON tree
expand buttons have names; path copy reports failures locally. Async errors leave
the current tool mounted and show a dismissible notice. Render errors no longer
auto-return to Home. Crash history persists generic notices only. Recent IDs
record completed navigation, so cancelled navigation does not change Last tool.

Verification: full Vitest regression passed 466/466 tests across 68 files with
one worker, no file parallelism and a 30-second test timeout. Web and Node
typechecks passed. Final main/preload/renderer production build passed; the
existing 2.9 MB SQL vendor chunk warning remains. The production renderer smoke
passed on Windows Edge headless: failed-save retention/retry, active-write
dismissal protection, save/discard before sign out, nested editor focus,
Left/Right/Home/End, async failure retention, 720x600 dialog bounds,
Back/beforeunload/palette blocking, cancelled-navigation recent IDs, tree copy
failure/retry, render failure past the old redirect delay and bridge-absent
preview. Save and clipboard calls in this smoke are synthetic in-memory fixtures,
not native vault/clipboard integration. Render-crash retry cannot recover state
already lost when a component crashed. Native writes, close prompts and other
platforms remain unverified. Toolbar/split-pane/search/theme/image/recovery
discovery improvements are still pending; this batch does not complete every
inventory row.

`tests/renderer-ux.smoke.mjs` exercises the production renderer through a local
HTTP server and a clearly isolated in-memory bridge fixture. Run it after the
build with an available Playwright module (`PLAYWRIGHT_MODULE` can specify its
module URL) and optional `UX_BROWSER_CHANNEL`, e.g. `msedge`. This standalone
check is separate from the Node-only Vitest suite and does not prove native
IPC, encryption, OS dialogs or Electron close behavior. It covers save failure
and retry, busy-write dismissal, sign out, edit modal focus, keyboard controls,
async failure feedback, narrow dialogs, Back/palette guards and render failure.

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
| Image Convert | Updated: generation/current-settings output guards, loading states, bitmap/URL cleanup, 32 MiB/16 MP/8192-side bounds, strict resize values, real encoder MIME check, JPEG background picker, raster/animation/metadata hints and keyboard chooser. Seven domain tests. Real browser chooser loaded a 1×1 PNG, PNG/JPEG/WebP converted; stale-format download disabled, width 9000 rejected, Cover output decoded at 800×600; 720×600 toolbar/footer smoke. | Pixel/alpha/crop fidelity with richer fixtures, corrupt/large files and concurrent file changes; native download roundtrip; post-decode source pixel limit does not prevent decode-time memory amplification; animation is flattened |
| Base64 Encode / Decode | Updated: strict alphabet/padding, exact UTF-8/BOM, binary hex view, disabled reverse on errors/hex, file actions and neutral empty feedback. Domain tests + browser invalid UTF-8/hex smoke. | File import/download and narrow layout |
| Base64 Image | Updated: current-text preview in both modes, MIME signature/mismatch checks, bounded file reading, decoded dimensions, corruption feedback, copy/download gated on successful image decode. Domain tests + browser PNG/stale-preview smoke. | File chooser and native download; preview download event did not complete in browser automation |
| Secure Random | Updated: actionable no-alphabet error, disabled actions, wrapped output, accurate alphabet upper bound, integer checks and chunked Web Crypto. Domain tests + renderer no-alphabet smoke. | Narrow byte/UUID modes, crypto-unavailable error handling |
| Key Generator | Updated: async Node key generation, strict sizes/comments, no stale result across parameter changes, busy controls, private reveal/clear, SPKI vs OpenSSH fingerprints and guarded IPC. Signing/X25519 tests; RSA 4096 yields the event loop. Browser RSA/bits and desktop-required smoke at 720×500. | Native renderer generation/copy flows and narrow result layout; encrypted saving depends on vault safety review |
| Hash | Updated: current-input async results, pending/failed feedback, wrapped digest and UTF-8 byte count. Independent digest vectors + browser MD5/copy-pending check. | Narrow layout and save flow |
| HMAC | Updated: no stale MAC, explicit missing key, show-secret toggle and connected label. Independent HMAC vectors + renderer missing-key smoke. | Renderer algo/format switching and narrow layout |
| JWT | Updated: Decode does not verify, explicit sample, exact HMAC secret bytes, strict Base64URL/UTF-8/object segments, claim date warnings, expected-algorithm match/critical-extension rejection, guarded header signing, debounced/current-input verification and stale signed-copy invalidation. Payload editor has JSON diagnostics and object validation; long secrets stay hidden. Nine tests including independent RSA/EC signatures. Browser Decode, array rejection, sign/copy/edit invalidation, wrong key, malformed payload and 720×600 footer verified. | More browser RS/ES PEM flows, edit-during-operation and live time refresh for exp/nbf; expected issuer/audience checks not implemented; signature verification alone is not authorization |
| AES-GCM | Updated: stale-result invalidation, explicit empty-result success, password labels/reveal, reverse-output and shortcut. Roundtrip/wrong-key/tamper tests + browser roundtrip, wrong-key, empty-plaintext and Ctrl+Enter smoke. Narrow 720×600 footer verified visible after scroll fix. | Edit-during-operation case |
| URL Tools | Updated: preserves special query keys, component/URL/form modes, actionable escaping errors, reverse-output, no generic history. Tests + renderer plus/percent cases. | Parse special keys and narrow layout in renderer |
| IP / CIDR | Updated: strict IPv4/IPv6, embedded IPv4, expanded loopback/link-local; real subnet mask/endpoints; separate mode inputs. 27 domain cases + browser subnet/mode-preservation smoke. | Narrow layout, clear/malformed renderer states; IPv6 CIDR explicitly unsupported |
| DNS Lookup | Updated: numeric-label/IDNA normalization, length validation, guarded single-job IPC, hard deadline, actionable DNS failures, TTL, SRV/SOA/PTR, samples/help, response timing and JSON Save to Box. 49 domain/service tests + real resolver/UDP loopback integration. Browser invalid path, URL/IDNA, PTR and 720×500 feedback verified. | Actual Electron bridge run/loading/empty/copy flows; macOS/Linux native smoke |
| HTTP Client | Updated: guarded request/cancel jobs, streaming 5 MB cap, timeout selection, raw/format response preserving JSON lexemes, lossless binary Base64, JSON body locations, duplicate params, genuine multipart text fields, frozen request controls and stale-result clearing. Real local HTTP tests; fetch/Axios config execution and PowerShell/Bash stubs prove quoting/body handling. | Renderer params/form/code/narrow flows; actual Electron request/cancel/save/copy; Go/Java/HTTPie/Python runtime checks; multipart file uploads unsupported |
| Port Manager | Updated: lsof field output, correct ss local address/all owners, hidden-PID listeners, Linux fallback, Windows IPv6, critical-process protection and trusted IPC. UI distinguishes desktop/loading/error/empty states, retains failed-refresh results, filters/clear/copy JSON, busy actions and keyboard dialog controls. 15 added tests including a real Windows listener; browser filters/clear/footer at 720×500. | Actual Electron scan/stop/copy/dialog integration; macOS/Linux native scans and stopping; PID reuse between ownership check and termination remains an OS race |
| SSH Keys & Hosts | Improved; verification partial | Host mutations patch one concrete block in place, preserving order, Match/Include, unknown/repeated directives, comments and line endings. Duplicate/pattern blocks show read-only reasons; stale missing aliases and injected lines are rejected. Per-config mutation queue, pre-write external-change check, byte-preserving UTF-8 reads and restrictive temporary config writes/backup. All SSH IPC methods check trusted sender and basic request shape/path/location; TCP has input validation and an absolute deadline. UI desktop-required state, async inventory/public-key guards, explicit field constraints, literal IdentityFile editing and honest TCP/config scope. Native Windows RSA/Ed25519 keys use readable OpenSSH v1 and private ACL staging. Key pairs are grouped; external reads require IdentityFile references and bounded key files. Rename publishes exclusive copies; delete/overwrite retain exact recovery backups with restore UI and partial-failure diagnostics. Invalid names, failed refresh and folder errors are explicit. Pending native renderer edit/delete/recovery workflows, Unix permission smoke, deeper filesystem race review and recovery discovery after restart. |
| File Hash | Updated: fixed 64 KB streaming, changed-file rejection, guarded IPC, byte progress, real abort and unmount cancellation, stale-copy suppression, accessible picker, recheck and checksum comparison. Domain/native-service tests + browser desktop-required and 720×500 scroll/footer smoke. | Actual Electron picker/algorithm/progress/cancel/error flows |
| Line Endings | Updated: separate CRLF/LF/CR counters, mixed feedback, selected-ending export, final newline and UTF-8 BOM preservation; 11 tests | Renderer import/export and narrow layout |
| Regex Tester | Updated: terminable worker, debounce/timeout/Cancel/Run, active-mode execution/export, strict flags, Unicode zero-width and sticky correctness, bounded replacement expansion/native substitutions, 1000-match/part display cap, accessible inputs/highlights and scrollable narrow layout. 17 domain/job tests; browser proves slow-pattern timeout/cancel/recovery, flags column, replacement copy, emoji matches and split captures. Production bundle worker ran under existing CSP. | Packaged Electron worker/native Save to Box; additional file/import UX; compile diagnostics use engine text without invented pattern offsets |
| Cron Calculator | Updated: strict token parsing and field/column errors, Sunday 7 ranges, day-step semantics, calendar skip/8-year search, seconds enumeration, UTC/local selector, explicit start/Now, count validation, export metadata, honest no-run and dialect/DST hints, narrow scrolling. 17 domain/start tests cover leap days, impossible dates, fractional start, explicit offsets and DST gaps/folds. Calendar-invalid starts are refused before Date normalization, with inline errors and export disabled. Browser UTC leap day/export, syntax column and impossible-date feedback verified; 720×600 footer remains visible. | Packaged app; arbitrary IANA zone selection not implemented |
| QR Code | Improved; verification partial | Debounced generation hides stale PNG/copy; validates capacity/options/minimum module size; default 4-module quiet zone and warning; exact PNG bytes, dimensions, version and UTF-8 payload size. Decode catches corrupt-image failures, rejects remote URLs, bounds files/pixels, versions jobs and revokes preview URLs; accessible file controls and read-only output. No generic drafts/history for credential payloads. Four domain tests and browser PNG → Unicode decode/copy preserve whitespace. Pending native downloads, corrupt/large file UI, clipboard images, scan quality at high density and other desktop platforms. |
| Private Box | Improved: legacy device secret preserved in a separate cache scheme; bounded/validated metadata distinguishes missing/corrupt/unreadable/unsupported. New salt refused over data or remnants. Invalid registry retained. All box IPC guard trusted frame/basic payloads. Root/metadata mutation and escaping junctions rejected. Status shows metadata backup paths and keeps portable boxes available when default initialization fails. Temp Windows fixtures prove legacy document unlock, metadata/registry byte preservation and junction/root guards. Explicit metadata recovery verifies original keys and all encrypted documents, preserves damaged metadata/backup bytes, and exposes Cancel. | Native metadata recovery interaction/progress; external-process registry edits and context identity for every separate CRUD IPC; external filesystem races, async KDF/key disposal, native multi-window CRUD/import/export/save/editor flows and macOS/Linux runtime |
| Keep | Improved: exact password whitespace, desktop-required guard, failed-save draft retained with visible editor error, duplicate-write/busy controls, unreadable file list, stale inventory/logout cleanup and original text for unrecognized JSON. Edit/pin saves retain unknown root fields and exact nested JSON/number lexemes; explicit Save labels and screen-reader control labels. Browser proves disabled preview actions and clear desktop error. | Native save-failure retry/draft, unlock/session conflicts, edit/delete focus, focus containment and responsive layout, native unknown-field round-trip, note import/export/recovery |
| Settings | Reviewed/improved: accurate persisted preferences vs in-memory payload explanation, cached draft/history counts, independent clear actions, accessible labels for theme/start/sidebar controls and flexible narrow appearance row. Session store test proves independent clearing. | Direct renderer preferences/reload, keyboard and clear actions; localStorage failure/hydration handling |
| About & Privacy | Reviewed/improved: removed unproven OS-reinstall recovery promise, states metadata/original-key backup requirements, network DNS/HTTP/TCP scope, persistent tool IDs vs in-memory payloads, plain SSH/export files, JWT signature limits. Preview no longer displays a guessed app version; native version failures are visible. | Direct renderer/native version error and narrow layout verification |

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

- Port Manager follow-up: full suite passed 368 tests across 50 files using the
  serial/30-second options. Both typechecks and production build passed. A
  test-owned Windows loopback listener proved real netstat/tasklist discovery
  without stopping user processes. Unix parsing/fallback and stop protection
  used fixtures/mocks; native macOS/Linux and Electron dialogs remain unverified.

- Regex/Cron follow-up: full suite passed 382 tests across 51 files with serial/
  30-second options. Both typechecks passed, production build emitted the external
  regex worker, and the production HTTP preview ran it under unchanged CSP.
  Slow-pattern timeout, explicit Cancel and recovery were verified in the browser.
  The final cron description adjustment passed its focused 13-test suite.

- JWT follow-up: full suite passed 387 tests across 51 files using serial/
  30-second options. Both typechecks passed and production build passed.
  Tests independently signed all RS/ES variants with Node crypto; all three
  HMAC algorithms preserve exact whitespace in secrets. Renderer checks used
  only local fixtures and Web Crypto, with no external key lookup.

- Image Convert follow-up: full suite passed 389 tests across 51 files with
  serial/30-second options; both typechecks and production build passed.
  Browser chooser and three encoders were exercised with a test-owned PNG.
  Export pixel fidelity and native download completion are not yet proven.

Next: finish outstanding renderer checks for these changes, then review the
remaining native tools, images/text tools and vault/Keep. Do not mark
the full task complete until every inventory row has implementation and direct
verification evidence or an explicitly reported environment limitation.

QR verification: 394 tests / 52 files passed; focused QR + session privacy rerun 18 passed after image timeout changes. Web and Node typechecks passed, final production build passed. Browser confirmed actual PNG-to-decode/copy preserves Unicode, leading spaces and newline; size 0 shows a specific error and removes old PNG controls. At 720x600 the body scrolls and status stays visible. Native download and file/paste failure paths remain pending.

SSH verification: full regression 405 tests / 54 files passed, plus 3 new TCP tests passed in a focused 6-test rerun. Both typechecks and production build passed. Real Windows OpenSSH ssh -G (no connection) confirmed specific host/user/port precedence and quoted key paths; real loopback TCP probe and stalled-connect deadline covered. Temporary custom-config tests verify exact edit/delete bytes, backup, literal tilde paths, and concurrent creates. Browser at 720x600 verifies disabled desktop-only actions and visible specific status; no mock desktop bridge was injected. Native renderer CRUD and Unix runtime remain unverified.

SSH key follow-up: fixed two verified native Windows failures (overly broad inherited ACL and unsupported Ed25519 PKCS#8 SSH file format). New SSH keys use OpenSSH v1 and private staging/publishing; actual ssh-keygen reads both RSA and Ed25519 and returns the expected public key. Inventory now groups pairs, excludes unrelated/protected files, bounds reads and authorizes external public keys through configured IdentityFile references. Key create/rename/delete protect custom config and stage exclusive targets; delete/replace preserve recovery copies. UI adds backup folder/copy/restore actions, filename validation, external-key read-only reasons and explicit no-passphrase/config-reference help. Tests cover publication failure, exact delete/restore/overwrite bytes, partial deletion metadata, collisions, protected files, Unicode source filenames and external read authorization. Full suite: 420/420 passed with one worker (same assertions/timeouts); higher parallelism under simultaneous build caused test/worker timeouts. Both typechecks passed. Final production build passed. Browser Keys preview confirms the explicit desktop-required/inventory-unavailable state; it does not verify native recovery actions. Public-only delete/restore and missing no-op rename now have regression coverage. Native renderer recovery workflows, Unix ACL/mode smoke and filesystem races remain pending.

Private Box / Keep follow-up: 431/431 tests passed with one worker; web and Node typechecks passed and diff check passed. Windows temporary fixtures prove that hardware cache/setup preserves legacy secret bytes and a legacy encrypted document still unlocks, corrupt/missing metadata and registry are not replaced, and root/metadata/junction escapes are rejected. IPC tests cover all trusted-sender guards, malformed mutation payloads, exact password/content characters and portable status when default initialization fails. Keep parsing preserves unrecognized JSON as original text. Browser preview shows explicit desktop-required errors and disabled Keep controls; native metadata recovery, note save-failure retry and OS safeStorage behavior were not UI-tested. Final production build passed. Remaining session/race/recovery/native UX work is listed above.

Session follow-up: 438/438 tests passed with one worker; both typechecks and diff check passed. Paused real-fixture I/O verifies read/list/write reject a box switch without exposing plaintext or changing either document, staged create/setup cancel before publish and clean temp files, import/export cancel after a dialog crosses sessions, and pending unlock/save cannot reopen after sign out. A prepared boxId save rejects a different selected box; a matching save remains readable. Renderer handles Electron-wrapped access errors, suppresses old list/open results, keeps edits arriving during Save dirty, blocks duplicate Save to Box requests and preserves exact password characters. Final production build passed. Actual native renderer flows, already-issued OS mutations, registry serialization and external filesystem replacement remain separate verification work.

Registry follow-up: 442/442 full regression tests passed; a focused 15-test rerun covers the final idempotent-default/remove-error change. Both typechecks passed. Registry reads/migration and complete mutations share a per-path main-process queue, preserving concurrent names/additions/removals and latest selected box. Failed transactions release the queue; concurrent Default Box requests share one ID/salt, and existing default checks do not rewrite registry. Private Box status ignores older refresh responses. Fixtures use real temporary files with delayed writes to verify originals stay visible until publish. Final production build passed. The queue does not coordinate external processes; cross-IPC document identity, native multi-window flows, metadata recovery and other pending tool UX checks remain open.

Metadata recovery follow-up: full regression passed 450/450 tests with one worker; the final focused recovery rerun passed 9/9 after adding backup-change and oversized-file cases. Both typechecks and final production build passed. Recovery uses asynchronous scrypt compatible with existing keys, validates every encrypted document (including hidden/metadata remnants), rejects unprovable empty legacy vaults and changed snapshots, restores exact backup bytes and preserves the corrupt original. Tests prove password whitespace, missing metadata, all-document proof, session cancellation before publish, changed backup refusal and bounded file reads. UI exposes explicit recovery and Cancel, but native Electron interaction/progress remains unverified. Normal setup/unlock still use synchronous KDF; external filesystem/process races and remaining inventory checks remain open.

Keep preservation follow-up: 455/455 tests passed across 66 files with one worker; both typechecks passed. Six Keep tests cover repeated/escaped owned keys, exact unknown-field bytes (including large/exponent numbers, duplicate nested members and __proto__), repeat edits, and raw-text fallback for unsupported owned field formats. Renderer save uses the original document body; new-note format is unchanged. Save buttons now describe their action and icon/search/color controls have explicit accessible labels. Native editor/save-failure retry, focus containment and responsive interaction still need direct UI verification. Final production build passed.

Cron start follow-up: full regression passed 459/459 tests across 67 files with one worker; both typechecks passed. Browser confirms non-leap February 29 shows the exact day-range error, clears runs and disables JSON/Save to Box, then a valid leap-day start with +07:00 and milliseconds restores runs. Copy JSON exports the exact UTC instant, Now refreshes the start, count 0 clears results/exports with a specific error, and UTC/local switching recomputes the same wall-time schedule in the selected zone. Parser fixtures cover century leap rules, normalized 24:00, invalid offsets and unsupported fractional precision. Start supports 1–3 fractional digits to match millisecond scheduling. Final production build passed.

DNS / common Save follow-up: 56 focused DNS and vault-session tests passed, including the real UDP resolver fixture; both typechecks passed. DNS now offers JSON Save to Box. Common Save shows non-access failures outside the password dialog instead of hiding them, announces errors/success, labels the password/dialog and clears the password on Cancel/Escape. Cancel is disabled during an active save; browser-only previews disable Save with a desktop-required reason. Browser confirms the DNS desktop-required state and new disabled Save control without injecting a mock bridge. Native lookup/loading/empty/copy and save-failure retry remain pending. Final production build passed.

Line Endings follow-up: 11 focused text tests and both typechecks passed. Fatal UTF-8 decoding optionally retains BOM for this preservation tool; other imports keep their existing BOM behavior. Shared imports invalidate unfinished replacements when input changes/unmounts, and Download is disabled during a read. Browser chooser verification was interrupted after the tool stalled; no import/download or edit-during-read success is claimed. Test-owned chooser fixtures were removed after interruption. Final production build passed.

Settings / About follow-up: 15 focused session-store tests and both typechecks passed. Settings clears cached drafts separately from history and reports retained payload counts. About distinguishes browser preview from native version loading/error, documents device-recovery limits and all explicit network operations, and describes local data persistence accurately. No appearance preferences or user history were changed by browser automation. Native/UI verification remains pending after the earlier browser interruption; this is source/domain evidence. Full regression passed 462/462 tests across 67 files with one worker. Final production build passed.
