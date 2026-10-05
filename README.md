# DevFusion

Cross-platform **local** developer toolbox built with Electron.

Local processing, a macOS-inspired UI, and quick tools in the desktop tray on Windows,
macOS 13+ and Linux. HTTP, DNS and TCP tools access the network only when you run them.

## Groups

| Group | Tools |
|-------|--------|
| JSON | Studio (format + virtualized tree), Diff (Lines + Tree), JSONPath |
| YAML | Studio (format/tree), Diff (Lines + Tree) |
| Convert | **Convert File Ext** — JSON ↔ YAML (extensible hub) |
| Design | **Color Picker** — desktop sampling, HEX/RGB/HSL/HSV, Copy/Repick popup and recent colors in RAM |
| Private Box | Encrypted vault (`.putl`) · device/portable 2-key · Finder-like explorer |
| Base64 | Text encode/decode, Image ↔ Base64 |
| Security | CSPRNG password/bytes/UUID, Hash, HMAC, JWT decode, AES-GCM |
| Network | URL, IP/CIDR, **DNS lookup**, HTTP client (explicit only) |
| File | File hash, **Line endings** (LF/CRLF/CR) |
| Text / Dev | **OCR · Image / PDF** — English/Vietnamese, local image/PDF extraction, screen or region capture; QR, regex and cron |
| App | Settings (theme + session history), About & privacy |

Session history is **in-memory only** and never records Security tools.

## Quick access and tray

- Tray → **Pick screen color…** works across the desktop, including other apps
  and the taskbar. A temporary overlay covers each captured display. After clicking
  a pixel, a small popup shows its color and HEX/RGB/HSL/HSV with individual Copy
  buttons and **Repick**. No automatic clipboard overwrite. Esc cancels selection;
  canceling Repick keeps the previous color. Close/Esc dismisses the result popup.
  Desktop snapshots are held only in RAM and released after selection/cancel.
- **Copy new UUID** works directly from the tray without opening the main toolbox.
- Tray → **Extract text (OCR)** → **Select screen region…** or **Capture current screen**
  extracts English/Vietnamese text locally. A small result popup offers Copy/Close;
  the OCR engine closes before this popup opens. Current screen means the display
  containing the pointer (primary display when cursor coordinates are unavailable).
- **Open tool** opens Color Picker, OCR, JSON, Base64, Secure Random/UUID or QR in the
  same app window. Every tray tool is available through Home, sidebar and search.
- Closing the main window releases the renderer, clears its RAM drafts/history
  and locks the vault. The native tray stays resident. Unsaved Keep changes prompt
  before closing. Use **Quit DevFusion** in the tray, application menu or Settings
  to stop the app completely. Minimize retains the window and its drafts.
- No automatic startup, screen polling, clipboard monitoring or hidden toolkit
  window. Electron's main/GPU/system services still consume memory while resident;
  tray mode does not mean zero RAM. Screen picking freezes a desktop snapshot;
  Repick captures a fresh one. Screen-recording permission and reliable display
  mapping are required; unsupported capture portals show an error. Manual color
  entry always remains available.

### OCR

Open **OCR · Image / PDF** from the sidebar or tray. Drop/upload a PNG, JPEG, WebP,
GIF, BMP or PDF, choose English/Vietnamese/both, then **Extract file text**. Correct
the result before Copy or Save .txt. PDF text layers are read directly; scan pages
use OCR one at a time. Enable **OCR every PDF page** for scans with text headers
or an incorrect text layer. Password-protected PDFs must be unlocked first.

Tesseract.js 7 with compact integer English/Vietnamese models and PDF.js 6 are
bundled offline. Opening the tool does not load these engines. An isolated temporary
renderer starts only for extraction and closes on completion/cancel; tray results
use a separate lightweight popup. No model CDN, uploads, history or payload drafts.
Limits: 32 MB/file, 16 million image pixels, 50 PDF pages, five minutes per job.
Animated images use one frame; handwriting and blurred/small text can be inaccurate.
See [OCR design and verification](docs/ocr.md).

## Lorem, time and Mock API

- **Lorem Text** generates bounded words, sentences or paragraphs locally, with
  Copy and .txt download.
- **Time / Date → Timestamp Converter** converts explicit Unix seconds/ms and
  ISO instants, displaying UTC and an IANA timezone. **Date Calculator** adds
  calendar days/months/years or elapsed durations and compares dates/instants.
- **Network → Mock API** builds endpoints in a form or YAML, with ordered
  conditional responses for header/query/path/JSON body, status, headers, delay
  and JSON/text body. Start opens a loopback server for your frontend; CORS
  permits local development origins. Try rules previews selection locally.
  Import/export shares a YAML contract. A started server stays active in the
  tray until Stop/Quit; drafts and config are not saved automatically.
  See the [Mock API schema and walkthrough](docs/mock-api.md).

## Architecture & AI coding guide

- [Architecture map and feature entry points](docs/architecture.md)
- [Shared coding rules for AI agents](AGENTS.md)
- [Claude / Copilot setup and workflow](docs/ai-workflow.md)
- [Repository review — 2026-10-04](docs/review-2026-10-04.md)

## Develop

Requires [pnpm](https://pnpm.io) (this repo pins `packageManager` in `package.json`).

```bash
pnpm install --frozen-lockfile
pnpm dev
```

```bash
pnpm test
pnpm typecheck
pnpm build       # production bundle → out/
pnpm pack        # unpacked app dir (electron-builder --dir)
pnpm dist:win    # Windows NSIS (x64)
pnpm dist:linux  # AppImage + deb (x64)
pnpm dist:mac    # DMG (x64 + arm64) — run on macOS
pnpm dist        # win + linux installers
```

### Performance packaging

Production builds use:

- **esbuild minify**, no sourcemaps, tree-shake
- **manual vendor chunks** (react / codemirror / icons / yaml)
- **React.lazy** tools — CodeMirror loads with tools that need it
- **asar + compression: maximum**, Electron locales stripped to `en-US`
- Cold start: window opens before default Secret Box disk setup

## Stack

- Electron + electron-vite
- React + TypeScript + Tailwind
- CodeMirror 6, Zustand, cmdk
- Design: macOS-inspired (HIG-like tokens, sidebar, Spotlight palette)

## Branding

**Mac-like HIG icon language**
- Blue/indigo rounded icon with overlapping modules, a clear F and cyan accent.
- One SVG master supplies app, window, installer and favicon exports.
- Separate monochrome template icon with real transparent letter cutouts for
  macOS tray; multi-size ICO for Windows and PNG for Linux.
- In-app chrome/About use SVG; no large logo bitmap is imported into startup.

| Asset | Use |
|-------|-----|
| `resources/icon.png` / `icon.ico` | Window + installer (1024 px master / multi-size ICO) |
| `src/renderer/src/assets/logo.svg` | Crisp in-app mark |
| `src/renderer/src/assets/logo.png` | Small raster companion |
| `src/renderer/public/favicon.png` | Favicon |
| `resources/tray*` | Native tray icons, including macOS 1x/2x templates |

Re-export assets with `node scripts/export-brand.mjs` (an available Playwright
installation is needed), then `python scripts/fix-icons.py` (Pillow). Optional
`PLAYWRIGHT_MODULE` and `UX_BROWSER_CHANNEL` select the local runtime/browser.
See [branding/tray decisions and QA](docs/devfusion-brand-tray.md).

The visible product/package name is DevFusion. Existing `DevUtils`/`devutils`
userData folders, `com.devutils.app` installation identity, `window.devutils`,
storage keys and crypto domains intentionally remain compatible. The rename
does not silently move a vault or generate replacement device keys.

## Security notes

- Renderer: `sandbox`, `contextIsolation`, no `nodeIntegration`
- Random / passwords: Web Crypto CSPRNG only (no `Math.random`)
- File hashing runs in the main process via a minimal preload API
