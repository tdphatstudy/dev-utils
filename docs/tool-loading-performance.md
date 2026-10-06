# DevFusion — tool loading and memory review, 2026-10-05

This is a production-renderer measurement and source review, not a user study or
a claim that every tool is fast on every machine. The benchmark uses synthetic
default inputs, an isolated Edge profile, and loopback HTTP assets. It never
opens a real vault, sends an HTTP/DNS request, starts a Mock server, captures the
screen, or performs OCR.

On 2026-10-06, Settings added an explicit **Preload** option. **On demand** remains
the default and preserves the graph measured below. These measurements do not
compare preload RAM or startup cost; see [tool loading modes](tool-loading-modes.md)
for the separate opt-in behavior and its verification.

## Findings and changes

### P2: the editor engine loaded on Home despite lazy tool components

The baseline production `index.html` had a `modulepreload` for
`vendor-codemirror-C_xlkNoS.js` (629,698 bytes). The entry module also imported its
`j` export: React's JSX runtime had been absorbed into the manually assigned
editor chunk. This was an actual eager dependency, not merely a filename in
Vite's dynamic-import dependency table. Initial browser requests confirmed it.

`electron.vite.config.ts` now assigns React, ReactDOM and scheduler explicitly to
`vendor-react`. The shell can use JSX without importing the editor engine.
Editor tools still import CodeMirror when opened; SQL and OCR remain separate.
This follows [Rollup's manual chunk documentation](https://rollupjs.org/configuration-options/#output-manualchunks):
manual chunks can include dependencies of the assigned modules, so chunk
boundaries must be checked in the generated graph and runtime requests.

This reduces eager JavaScript loading. The removed byte count is **not an
Electron RAM saving**; source bytes, compiled code, JS heap, DOM and OS working
set are different quantities.

### P2: initial YAML and Regex results waited for a typing debounce

Both hooks applied a 200 ms debounce on the first mount. In the baseline, YAML
controls painted in 97 ms but its default result appeared in 295 ms; Regex
controls painted in 97 ms but its result appeared in 278 ms. Reopening the tools
still recreated workers and repeated the debounce.

The first analysis now starts at the next timer opportunity. Subsequent input
edits retain the 200 ms debounce, bounded worker deadlines, stale-input guards,
and worker termination on success, failure, cancellation or unmount. The first
timer is still cancellable: restoring a draft invalidates the sample job before
it can publish stale output. No parsing or regex execution moved to the UI
thread.

### Lazy loading delays loading; it does not provide manual module eviction

[React lazy](https://react.dev/reference/react/lazy) postpones loading until the
component is needed and caches the resolved component. The JavaScript module
environment also caches successfully loaded modules; there is no supported
manual clearing of its namespace cache. [MDN import()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)

Leaving a tool unmounts its UI and stops its workers, but does not imply its
library code has left RAM. OCR is a separate transient processing renderer;
opening the OCR tool alone must not request its engine, language models or PDF
worker. The benchmark guards that boundary. No eager prefetch-all, cache-busting
imports, or background workers were added.

## Measurement method

`tests/tool-loading-performance.smoke.mjs` measures eight tools at 1180×760.
Each cold measurement has a fresh browser context and opens Home first; each
warm measurement returns Home and reopens the same tool in that context. It
uses three rounds and reports their median. Cold refers to the browser context
and module graph, **not a cold operating-system disk cache**.

Timing begins inside the page immediately before changing the tool route.
Paint readiness means a representative input/editor is present with nonzero
layout height, followed by another animation frame. YAML and Regex additionally
wait for the default analysis status. This excludes Playwright click scheduling
and does not claim to measure literal monitor presentation or human perception.

The report records resource timings/decoded bytes, main-thread ScriptDuration,
TaskDuration, layout/style metrics and long tasks. ScriptDuration includes
application and rendering JavaScript; it is not a pure module-evaluation timer.
Optional browser JS heap fields are approximate and are not Electron/process
RSS. No RAM reduction percentage is claimed from them.

Baseline: existing production output before this revision, Edge 154.0.4258.53,
2026-10-05. Initial Home JavaScript requests totaled 966 KiB, including the
615 KiB editor chunk. Concurrent host activity moved some earlier repeated
measurements by 50–100 ms, so small timing differences should not be treated as
proven speedups.

| Tool | Baseline cold paint | Baseline warm paint | Baseline cold result | Baseline warm result |
|---|---:|---:|---:|---:|
| Lorem Text | 55 ms | 18 ms | 55 ms | 18 ms |
| Timestamp Converter | 62 ms | 14 ms | 62 ms | 14 ms |
| JSON Studio | 103 ms | 27 ms | 103 ms | 27 ms |
| YAML Studio | 97 ms | 21 ms | 295 ms | 239 ms |
| SQL Studio | 226 ms | 31 ms | 226 ms | 31 ms |
| Regex | 97 ms | 26 ms | 278 ms | 239 ms |
| Mock API | 65 ms | 25 ms | 65 ms | 25 ms |
| OCR | 40 ms | 15 ms | 40 ms | 15 ms |

For tools without asynchronous initial analysis, “result” is the same readiness
proxy as paint. OCR recognition is deliberately not included. The SQL cold
navigation requested approximately 2.9 MiB of additional code; warm navigation
used the cached module. This test did not reproduce a several-second delay.
Development-server compilation, installed Electron/file assets, large restored
drafts and other machines require separate profiling before assigning a cause.

## Verification and reproduction

The benchmark checks that Home does not load tool UIs, SQL or the editor; opening
JSON loads the editor; warm navigation does not refetch cached tool/library
modules; and navigation does not load OCR engines/models. It also tests real
YAML/Regex workers with synthetic drafts: edit debounce, completed-worker
disposal, cancellation before a pending job launches, and correct draft results
after remount. It fails on renderer exceptions.

Run after `pnpm build`, with Playwright available:

```powershell
$env:UX_BROWSER_CHANNEL = 'msedge'
$env:PERF_ROUNDS = '3'
$env:PERF_OUTPUT = 'C:/path/to/tool-loading-final.json'
node tests/tool-loading-performance.smoke.mjs
```

`PLAYWRIGHT_MODULE` can point to an existing Playwright module. Only when
reproducing the old baseline, `PERF_ALLOW_EAGER_EDITOR=1` disables the new editor
boundary assertion. That exception should not be used for the final build.

Optional native sampling uses `PERF_NATIVE=1` with a hidden Electron window,
production file assets, a temporary profile, and sandbox/context isolation/web
security enabled. It measures the fixture's **renderer process**, not total
DevFusion memory or the full main-process service graph. Samples wait 250 ms for
quiet rendering; they do not force GC or trim operating-system working sets.
`ELECTRON_PATH` can select an existing executable; the default is this Windows
checkout's Electron executable.

Native baseline on Windows, Electron 44: Home used about 122 MiB working set /
44 MiB private memory; after JSON and SQL, returning Home sampled 150 MiB /
70 MiB. Destroying the fixture window left zero renderer processes. These are
individual short samples, not stable allocations or a percentage saving.
They illustrate why returning Home must not be described as unloading all
libraries. Browser/main/GPU processes and OS caches still exist after a window
closes.

The first native attempt was blocked by the Windows restricted-process ACL on
the local Electron executable. The same fixture passed on the host; no ACL,
sandbox setting or dependency files were changed.

## First UX integration measurement (2026-10-05)

The first UX integration run uses the same Edge version, fixture inputs, viewport
and three fresh-context rounds. Initial Home JavaScript was **362,309 bytes
(354 KiB)** versus **989,221 bytes (966 KiB)** in the baseline. Runtime requests
confirm no CodeMirror, SQL tool or OCR engine/model on Home. The editor is fetched
when the first editor tool is opened and reused on warm navigation.

| Tool | Final cold paint | Final warm paint | Final cold result | Final warm result |
|---|---:|---:|---:|---:|
| Lorem Text | 64 ms | 17 ms | 64 ms | 17 ms |
| Timestamp Converter | 64 ms | 18 ms | 64 ms | 18 ms |
| JSON Studio | 143 ms | 27 ms | 143 ms | 27 ms |
| YAML Studio | 119 ms | 20 ms | 149 ms | 42 ms |
| SQL Studio | 219 ms | 29 ms | 219 ms | 29 ms |
| Regex | 110 ms | 28 ms | 127 ms | 43 ms |
| Mock API | 94 ms | 24 ms | 94 ms | 24 ms |
| OCR | 44 ms | 16 ms | 44 ms | 16 ms |

YAML's first result fell from 295 to 149 ms and Regex from 278 to 127 ms; their
warm result times fell from 239 to 42/43 ms. Removing the initial typing debounce
has a clear causal explanation. Small differences in paint time remain sensitive
to host load. JSON's first open increased from 103 to 143 ms: the editor is now
loaded at that point instead of on Home. This tradeoff is intentional and does
not support an all-tools-faster claim. That three-round run did not reproduce
a several-second production delay.

Native Electron 44.5.1 final snapshots on Windows, with the same isolated hidden
window and temporary profile:

| Phase | Renderer working set | Renderer private bytes |
|---|---:|---:|
| Home | 110 MiB | 40 MiB |
| JSON | 125 MiB | 52 MiB |
| SQL | 143 MiB | 69 MiB |
| Home after tools | 145 MiB | 71 MiB |
| Window destroyed | 0 renderer processes | 0 renderer processes |

The initial Home sample was lower than baseline (122/44 MiB), but one short
snapshot per phase cannot establish a stable RAM saving. Returning Home retained
loaded code and higher private memory; destroying the renderer ended that process.
These figures exclude the full app service graph, main/GPU memory and OS caches.
Native macOS/Linux, larger user inputs and representative users remain unmeasured.

The final benchmark passed real worker lifecycle checks: first result, typing
debounce, completion disposal, pending-job cancellation and latest restored draft.
Separate loading-feedback tests deliberately hold or abort chunks to check
navigation, honest failure recovery and reduced motion; those injected waits are
not included in the timing table. No production delay, telemetry or new dependency
was added.

## Continuation verification (2026-10-06)

After Keep, AES/HMAC, Cron and modal-focus repairs, the same Edge154 fixture was
checked again. Home requested **362,449 bytes (354 KiB)** of JavaScript; the
heavy editor, SQL engines and OCR engine/models stayed unloaded. Worker debounce,
completion disposal, pending-unmount cancellation and restored-draft results pass.
This run did not repeat native memory sampling; previous RAM limitations still apply.

A one-round check recorded a **4,310 ms SQL cold open**. The unchanged
`vendor-sql-D-7d9JZq.js` chunk (2,903,434 bytes) had **3,788 ms resource duration**;
script time was 287 ms and recorded long tasks totaled 241 ms. This is evidence
of a multi-second load in that fixture and must not be discarded because earlier
medians were fast. It does not establish a four-second synchronous SQL parse.
The resource timing lacks request/TTFB/server-read breakdown, so the precise
system, disk, browser or loopback-server cause is unproven.

A quiet three-round repeat observed SQL cold **286/353/260 ms** and warm
**27/29/32 ms**. SQL resource duration was **90/152/63 ms**, with no recorded
≥50 ms long task. Median values for that complete repeat:

| Tool | Cold paint | Warm paint | Cold result | Warm result |
|---|---:|---:|---:|---:|
| Lorem Text | 73 ms | 23 ms | 73 ms | 23 ms |
| Timestamp Converter | 58 ms | 20 ms | 58 ms | 20 ms |
| JSON Studio | 158 ms | 32 ms | 158 ms | 32 ms |
| YAML Studio | 153 ms | 25 ms | 197 ms | 52 ms |
| SQL Studio | 286 ms | 29 ms | 286 ms | 29 ms |
| Regex | 143 ms | 34 ms | 162 ms | 52 ms |
| Mock API | 137 ms | 26 ms | 137 ms | 26 ms |
| OCR | 56 ms | 18 ms | 56 ms | 18 ms |

SQL is still lazy relative to Home, but opening it imports both sql-formatter
and node-sql-parser and performs initial validation/formatting. There is no
intentional multi-second delay. The large SQL chunk remains a candidate for a
separate loading/processing design after larger-input profiling; this iteration
did not change SQL semantics, prefetch it at idle or claim all tools always load
under one second. Raw artifacts: `tool-loading-continuation-check.json` and
`tool-loading-continuation-3round.json` in the session artifact directory.
