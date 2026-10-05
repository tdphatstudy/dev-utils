# OCR · Image / PDF

Implemented on `feat/secret-box`, 2026-10-05. OCR is local and starts only after
an explicit extraction/capture action. English and Vietnamese ship with the app.

## User flows

- Main app: sidebar **OCR · Image / PDF** → upload/drop one image or PDF → choose
  language → **Extract file text**. Review/correct the text, Copy or Save .txt.
  Progress and Cancel are available. Leaving the tool cancels its owned job and
  clears its component result; a failed/canceled extraction preserves prior text.
- PDF: text-bearing pages use PDF.js text extraction; image-only pages render and
  use OCR. **OCR every PDF page** handles scans with digitized headers/page numbers
  or an unreliable text layer. Password-protected PDFs need prior unlocking.
- Tray: **Extract text (OCR)** → **Select screen region…** (drag within one display,
  Esc/Cancel to exit) or **Capture current screen** (pointer's display; primary on
  systems without pointer coordinates). These actions also exist in the main app.
  Tray defaults to English + Vietnamese. After recognition the engine closes, then
  a separate small text popup offers explicit Copy and Close/Esc. No automatic copy.

## Engine and memory decisions

Tesseract.js 7.0.0 runs the LSTM engine in a browser worker. The compact quantized
`4.0.0_best_int` English/Vietnamese models are ~2.95 MB / ~1.42 MB compressed. They
balance size and printed-text recognition without bundling a large neural inference
runtime. Tesseract.js selects fallback/SIMD/relaxed-SIMD LSTM cores for the device;
legacy OCR cores are omitted because the worker is fixed to OEM 1.

PDF.js 6.4.299 reads text layers and renders scan pages; only one page canvas and
one OCR worker are active. Text-only PDFs never create Tesseract workers. All model,
worker, font, cmap and decoder assets ship locally, including licenses. These are
build dependencies because runtime uses browser bundles/assets, avoiding duplicate
Node packages, unused native canvas binaries and legacy models in the installer.
See the upstream [Tesseract worker API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md),
[language model packaging](https://github.com/naptha/tessdata/blob/gh-pages/README.md)
and [PDF.js](https://mozilla.github.io/pdf.js/getting_started/).

Opening Home/the OCR tool or starting the tray creates no OCR worker/model. A
temporary sandboxed renderer starts when an extraction runs, dynamic imports only
what that input needs, then terminates workers and closes completely. Errors,
Cancel, owner destruction and a deadline also destroy it. Keeping a tray result
open holds only a separate DOM text popup. The nonpersistent OCR partition drops
its cache at helper teardown; language caching is disabled (`cacheMethod: none`).
OS/Electron services and the app window still have their own RAM footprint.

The offline asset directory is ~20.9 MiB uncompressed; this is disk size, not idle
RAM or installer overhead. In the native Windows fixture (English/Vietnamese PNG,
PDFs, region and whole-screen capture), one run measured ~64 MiB cold RSS, ~661 MiB
peak and ~395 MiB after closing all windows and waiting two seconds. No renderer
processes remained; the residual was Browser ~180 MiB, GPU ~167 MiB and Utility
~48 MiB. These are sums for the entire synthetic Electron fixture, include native
screen/graphics allocations and vary by machine. They prove engine renderer
cleanup, not a return to cold-start memory or a low total Electron footprint.
Native image/graphics caches can remain after heavy capture work; a strict idle
RAM budget would require further profiling of the shared Electron/capture layer.

## Privacy and trust boundary

No uploads, telemetry, automatic clipboard changes or background screen polling.
File bytes, snapshot images and output text remain in RAM; no screenshot/temp-input
files are created. `text.ocr` is excluded from session history and generic drafts.
Only explicit Copy/Save .txt moves text outside the tool. OCR content is not logged.

Main IPC validates the app sender and runtime inputs. The helper has its own named
bridge; main checks active helper identity, main frame, exact URL, mode and bounded
result/progress/coordinates. There is no raw IPC, command, file-path or arbitrary
URL method. Cropping happens in the disposable selection renderer using normalized
coordinates mapped to native pixels, including negative display origins and DPI.
Main validates normalized bounds against original snapshot dimensions and checks
crop byte signatures, pixel limits and exact expected dimensions. It does not
decode another large NativeImage in the resident main process. OCR/selection
canvases use CPU backing (`willReadFrequently`) to avoid large GPU readbacks.

The helper uses sandbox/contextIsolation/webSecurity, Node integration off,
denied navigation/popups/permissions, and an in-memory partition. Production uses
the secure `devfusion-ocr://local` scheme, mapping only shipped renderer assets
inside the renderer root. HTTP/HTTPS is blocked (dev allows only the configured
Vite origin). Only the runner CSP permits `wasm-unsafe-eval` for WebAssembly; the
main app CSP is unchanged. Selection/result pages have no network access or OCR
library imports and render recognized content as textarea text, never HTML.

## Limits and known behavior

| Limit | Behavior |
|---|---|
| Input | One PNG/JPEG/WebP/GIF/BMP/PDF, up to 32 MiB |
| Images | Up to 16 million pixels and 16384 px per side; inspect headers before decode/preview |
| PDF | Up to 50 pages; scan canvas <=16 million pixels and <=8192 px per side |
| Output | Up to 2 million characters |
| Job | One active OCR job; five-minute deadline; 15-second helper load deadline |
| Desktop | Snapshot adapter: 1–8 displays, <=64 million total pixels / 128 MiB encoding |

One region belongs to one monitor; dragging across a monitor boundary requires
another capture. Full-screen OCR above the image limit requests a smaller region.
Animated images use their first frame. OCR is intended for printed text; handwriting,
blur, tiny fonts, rotation and complex columns can reduce accuracy. PDF text ordering
depends on the document's text layer; preserving layout/tables is outside this tool.
Huge embedded PDF images can be refused/skipped by PDF.js decoder limits.

macOS screen-recording permission and Linux capture portal/display mapping apply
as for Color Picker. Some Wayland multi-display portals omit display IDs and fail
clearly. Physical multi-monitor mixed-DPI capture, macOS and Linux still need native
QA; fixture tests cover coordinate mapping but do not prove those OS adapters.
Installer smoke testing/signing and representative real-world OCR accuracy benchmarks
have not been completed.

## Verification

- Unit suite: runtime file/pixel/output bounds, binary signatures, image headers,
  normalized region mapping, stale/foreign/subframe IPC rejection, ownership,
  cancellation/late native capture, deadline/display changes and helper destruction.
  Session policy tests include OCR payload exclusion; tray keeps existing behavior.
- Production UI smoke (`tests/ocr-ui.smoke.mjs`): no engine assets on Home/tool
  mount, upload/language/force mode, editable literal results, clipboard retry,
  progress/Cancel, previous-text preservation, malformed/huge images, unmount
  cancellation, cleared results, minimum window layout, desktop-required state,
  reverse-drag selection at 2x pixel scale and Esc.
- Vite development smoke (`tests/ocr-dev.smoke.mjs`): actual OCR worker/core/model
  served by the same local asset plugin with external browser requests blocked.
- Native Windows (`tests/electron-ocr.smoke.mjs`): actual offline WASM/model OCR
  of English/Vietnamese PNG, PDF text layer without OCR, two-page scanned PDF,
  forced PDF OCR, cancel during startup, known app-owned OS screen region and
  fullscreen fixture, separate lightweight result popup, Close cleanup and zero
  remaining renderer processes when fixtures/results close. No real vault or
  clipboard read/write is used; only generated fixture text is asserted.
- Full suite: 521 tests / 78 files with `pnpm test --maxWorkers=1
  --fileParallelism=false --testTimeout=15000`; typecheck and production build passed.
  The 15-second test timeout accommodates the existing crypto KDF checks. The
  existing SQL vendor chunk size warning remains.

Run development with `pnpm install --frozen-lockfile`, then `pnpm dev`. OCR model
files are installed at dependency-install time and included in the build; there is
no first-run network download. Browser preview reports desktop required.
