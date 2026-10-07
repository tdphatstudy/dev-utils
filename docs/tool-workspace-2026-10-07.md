# Tool workspace UI review — 2026-10-07

## Scope

JSON Schema Validator, Data Reconciliation, API Contract Review, Structured Log
Explorer, Environment Compare, API Stress Test, Hash Lab, HTTP Security Headers,
CORS Policy Probe and JWT Security Review now use the same macOS-style workspace
components as the established editor tools.

Actions remain visible while inputs and results scroll separately. On smaller
windows, Input/Results tabs preserve the documents and reveal results when an
operation completes. Paired sources have their own accessible tabs. Instructions
are short and task-oriented; technical limits are available in a disclosure.
Request parameters and headers have collapsible sections with configured counts.
Body-format labels and job states describe their meaning rather than displaying
internal enum names. Reports retain their original machine-readable contracts.

## Important regressions covered

- Hidden panels must actually be hidden despite their flex layout classes.
- Editing any input, including CodeMirror request bodies, clears stale results.
- Stop remains outside the disabled request form.
- A running network test locks the CodeMirror body as well as native fields.
- Editor transaction limits keep displayed text and submitted state consistent.
- Clear or navigation invalidates an in-flight local file import.
- Leaving cancels workers/network jobs and clears transient sensitive input.
- Report redaction and the per-tool consent gate remain intact.

## Verification boundaries

Browser fixtures exercise production renderer bundles and real local analysis/hash
workers. Network UI tests use a typed bridge fixture; service/IPC tests and the
Electron smoke suite check the privileged boundary separately. Window sizes are
1180×760 and 720×500, with light/dark surfaces. The existing 50-route UX sweep and
13-language suite cover shared-component regressions.

These checks do not guarantee that an application can never crash. Native macOS
and Linux interaction is unavailable on this Windows host. Backend diagnostics,
some detailed technical prose and generated findings still use English fallback;
input values and exported protocol identifiers are never translated.

## Completed checks

- `pnpm test --maxWorkers=1`: 993 tests in 106 files passed. A crypto timeout
  during the earlier concurrent build/test run passed independently and in this
  complete sequential run; no crypto test timeout or implementation was changed.
- `pnpm typecheck`, final `pnpm typecheck:web`, and `pnpm build`: passed. The
  pre-existing lazy SQL chunk size warning remains.
- `tests/advanced-tools-ui.smoke.mjs`, `tests/enterprise-ui.smoke.mjs`,
  `tests/security-testing-ui.smoke.mjs`: passed, including real worker results,
  hidden pane checks, import races, bounded paste, read-only request bodies and
  result invalidation after edits.
- `tests/i18n-ui.smoke.mjs`: 13 languages plus System, Vietnamese analytical
  results, RTL, input preservation and preference rollback passed.
- `tests/ux-review-ui.smoke.mjs`: 50 routes in two themes at two sizes passed;
  no renderer errors or horizontal control overflow were reported.
- `pnpm test:electron:security`, `pnpm test:electron:packaged`: passed on Windows,
  including consent/IPC refusal, file-URL workers and forced renderer recovery.
- Windows directory package rebuilt at `release/win-unpacked/DevFusion.exe`;
  `pnpm verify:package release/win-unpacked/DevFusion.exe` passed. This is an
  unsigned local build.
