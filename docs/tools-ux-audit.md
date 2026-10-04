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
| HTML Studio | Source review: mixed content and raw text need preservation; error locations absent | Implement, test and renderer check |
| XML Studio | Source review: quoted `>` and mixed text formatting; missing root validation/locations | Implement, test and renderer check |
| SQL Studio | Updated: literal/comment-safe minify, structured locations, honest Oracle validation limit; domain tests | Renderer dialect/error/file flows |
| Convert File Ext | Updated: shared diagnostics, YAML preservation and JSON representation checks; domain tests | Renderer swap/file/empty flows |
| Image Convert | Pending | Source, failures, image export fidelity, renderer |
| Base64 Encode / Decode | Updated: strict alphabet/padding, exact UTF-8/BOM, binary hex view, disabled reverse on errors/hex, file actions and neutral empty feedback. Domain tests + browser invalid UTF-8/hex smoke. | File import/download and narrow layout |
| Base64 Image | Updated: current-text preview in both modes, MIME signature/mismatch checks, bounded file reading, decoded dimensions, corruption feedback, copy/download gated on successful image decode. Domain tests + browser PNG/stale-preview smoke. | File chooser and native download; preview download event did not complete in browser automation |
| Secure Random | Updated: actionable no-alphabet error, disabled actions, wrapped output, accurate alphabet upper bound, integer checks and chunked Web Crypto. Domain tests + renderer no-alphabet smoke. | Narrow byte/UUID modes, crypto-unavailable error handling |
| Key Generator | Pending | Async state, formats, private-key handling, native save |
| Hash | Updated: current-input async results, pending/failed feedback, wrapped digest and UTF-8 byte count. Independent digest vectors + browser MD5/copy-pending check. | Narrow layout and save flow |
| HMAC | Updated: no stale MAC, explicit missing key, show-secret toggle and connected label. Independent HMAC vectors + renderer missing-key smoke. | Renderer algo/format switching and narrow layout |
| JWT | Pending | Decode vs verify distinction, malformed payload, async verification |
| AES-GCM | Updated: stale-result invalidation, explicit empty-result success, password labels/reveal, reverse-output and shortcut. Roundtrip/wrong-key/tamper tests + browser roundtrip, wrong-key, empty-plaintext and Ctrl+Enter smoke. Narrow 720×600 footer verified visible after scroll fix. | Edit-during-operation case |
| URL Tools | Updated: preserves special query keys, component/URL/form modes, actionable escaping errors, reverse-output, no generic history. Tests + renderer plus/percent cases. | Parse special keys and narrow layout in renderer |
| IP / CIDR | Updated: strict IPv4/IPv6, embedded IPv4, expanded loopback/link-local; real subnet mask/endpoints; separate mode inputs. 27 domain cases + browser subnet/mode-preservation smoke. | Narrow layout, clear/malformed renderer states; IPv6 CIDR explicitly unsupported |
| DNS Lookup | Pending | Input validation, progress, timeout, bridge/native smoke |
| HTTP Client | Privacy denylist updated | Request/response/errors, secret headers, cancel, snippets, bridge/native smoke |
| Port Manager | Existing review identified Linux/macOS parsing defects | Fix adapters, empty/loading/error UX, native smoke |
| SSH Keys & Hosts | Existing review identified lossy config rewrite; privacy denylist updated | Lossless edits, key creation, save/permissions, native smoke |
| File Hash | Pending | Large files, progress/cancel, failed reads, native smoke |
| Line Endings | Pending | Detection/mixed/newline preservation, import/export |
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

Next: finish outstanding renderer checks for these changes, then review the
markup/Base64 tools, native tools, images/text tools and vault/Keep. Do not mark
the full task complete until every inventory row has implementation and direct
verification evidence or an explicitly reported environment limitation.
