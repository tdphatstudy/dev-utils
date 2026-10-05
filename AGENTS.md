# DevFusion: shared instructions for coding agents

This is the canonical repository guide for Codex, Claude, Copilot and other agents.
Read `docs/architecture.md` for the product and dependency map, and
`docs/review-2026-10-04.md` for known defects before touching sensitive features.
Tool-specific instruction files should point here instead of duplicating rules.
Explicit user instructions take precedence over this guide.

## Product intent

DevFusion is a local-first Electron desktop developer toolbox for Windows, macOS
and Linux. It combines data/text utilities, explicit network tools, an encrypted
Private Box, and Keep notes stored in the default Secret Box. Preserve local
processing, the existing macOS-inspired UI, and lazy loading of tools.
Cross-platform means desktop here; mobile and a standalone web app are not
implemented. HTTP, DNS and TCP probes intentionally use the network after a user
action. Do not introduce background uploads or telemetry by default.

## Before editing

- Read `git status --short`; preserve unrelated and uncommitted user work.
- Trace the feature from its registry entry through UI, shared types, preload
  and main handler as applicable. Read the existing tests for that path.
- Distinguish current implementation from desired invariants. The review lists
  defects; existing code is not proof that a pattern is safe.
- Keep changes scoped to the request. Do not silently migrate data, replace the
  framework, add an agent platform, or install unrelated dependencies.

## Dependency boundaries

- `src/renderer/src`: React UI and browser APIs; OS operations through the typed
  `window.devutils` bridge. Never import main modules or Node runtime APIs here.
- `src/preload/index.ts`: minimal named bridge methods, not business logic.
  Never expose raw `ipcRenderer`, arbitrary channels, or arbitrary command APIs.
- `src/main`: Electron lifecycle, dialogs, OS/network/file access and services.
  Main handlers are the trust boundary: validate sender and payload at runtime.
  TypeScript types alone do not validate IPC input.
- `src/shared`: contracts and domain utilities reusable without Electron.
  Some utilities need browser APIs; keep browser, Node and pure requirements
  explicit. Do not import Electron or renderer/main modules into shared.
- Prefer `@renderer`, `@shared`, `@main` aliases as configured for each target.
  Preserve strict TypeScript, single quotes and the existing semicolon style.

## Where changes belong

- New toolbox tool: `src/shared/<domain>` for reusable processing;
  `src/renderer/src/features/tools/<group>` for UI;
  `src/renderer/src/registry/tools.ts` for stable ID, metadata and lazy import.
- New privileged operation: shared request/result types, then main service and
  IPC registration, then preload method, then renderer integration. The global
  Window type already derives from `DevUtilsApi`; keep it connected.
- New vault content kind: `src/shared/secret-box/content-kinds.ts`, payload and
  IO types as needed, `src/renderer/src/content/editors/registry.tsx`, then
  import/export and round-trip behavior. Preserve binary encoding and MIME.
- Platform-specific code: isolate adapters under `src/main/platform`; prefer
  explicit arguments with `execFile` and `windowsHide: true` for subprocesses.
- `src/shared/privatebox` is a compatibility facade. New domain code belongs in
  `src/shared/secret-box`; preserve existing on-disk names and IPC channel names.

## Safety and compatibility invariants

- Never put passwords, private keys or decrypted vault content in persistent
  settings, logs, session history or generic drafts. Explicit encrypted saves
  and user-requested plaintext export are separate product actions.
- Review privacy policy when adding a tool: the current `NO_HISTORY_TOOLS`
  denylist is incomplete for newer tools; do not copy that omission.
- Keep `sandbox`, `contextIsolation`, `webSecurity` enabled and Node integration
  disabled. Restrict navigation and external URL schemes; do not loosen CSP
  broadly to make a preview work. Allow only the resource classes it requires.
- Vault mutations must stay within the active root after symlink/junction
  resolution. Reject root deletion and access to `.privatebox` metadata through
  ordinary document operations. Re-check session identity across awaited IO.
- Treat missing, corrupt, unreadable and unsupported vault metadata differently.
  Never recreate salts/keys over an existing vault or overwrite legacy device
  secrets just to cache a new key. Preserve recovery material and format versions.
- SSH config edits must preserve order, comments, repeated directives, `Host *`,
  `Match` and `Include`. Unsupported syntax needs a safe refusal or lossless
  preservation. Never rewrite an entire config using a lossy summary parser.
- SSH private key creation needs restrictive permissions from the initial write,
  no accidental overwrite, and recovery if a key-pair mutation only partly succeeds.
- Network/file operations need bounded input, response size and timeouts. Prefer
  streaming large files. Keep CPU-heavy crypto/parsing off latency-sensitive paths
  when profiling or a real bug justifies that change.

## Commands and verification

Use the pnpm version pinned by `packageManager` in `package.json` and preserve
`pnpm-lock.yaml`. Install with `pnpm install --frozen-lockfile` when needed.

```sh
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

- For functional changes, run focused tests first and the relevant full checks
  above. Regression tests should prove behavior, especially data preservation and
  platform output parsing. Documentation-only edits need link/path/diff checks.
- Current Vitest runs Node tests, not renderer/Electron end-to-end tests.
  A passing suite does not prove UI media, native dialogs or all OS adapters work.
- For platform changes, use Windows/macOS/Linux fixtures and smoke-test affected
  OSes when available. Report unavailable platforms rather than claiming coverage.
- Installer commands are `pnpm dist:win`, `pnpm dist:mac`, `pnpm dist:linux`.
  macOS packaging must run on macOS. Signing/notarization is not configured as a
  complete release pipeline; do not claim signed production artifacts.
- Do not modify `node_modules`, `out`, `release` or `*.tsbuildinfo` as source fixes.
  Build commands may generate ignored outputs.
- Report what changed, checks run, and material limitations. Never report a
  blocked or unrun check as passing. Update architecture docs when boundaries,
  storage format, tool registration or privacy behavior change.
