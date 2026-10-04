# DevUtils

Cross-platform **local** developer toolbox built with Electron.

Privacy-first: all processing happens on your machine. macOS-like UI on Windows, macOS, and Linux.

## Groups

| Group | Tools |
|-------|--------|
| JSON | Studio (format + virtualized tree), Diff (Lines + Tree), JSONPath |
| YAML | Studio (format/tree), Diff (Lines + Tree) |
| Convert | **Convert File Ext** — JSON ↔ YAML (extensible hub) |
| Private Box | Encrypted vault (`.putl`) · device/portable 2-key · Finder-like explorer |
| Base64 | Text encode/decode, Image ↔ Base64 |
| Security | CSPRNG password/bytes/UUID, Hash, HMAC, JWT decode, AES-GCM |
| Network | URL, IP/CIDR, **DNS lookup**, HTTP client (explicit only) |
| File | File hash, **Line endings** (LF/CRLF/CR) |
| App | Settings (theme + session history), About & privacy |

Session history is **in-memory only** and never records Security tools.

## Architecture & AI coding guide

- [Architecture map and feature entry points](docs/architecture.md)
- [Shared coding rules for AI agents](AGENTS.md)
- [Claude / Copilot setup and workflow](docs/ai-workflow.md)
- [Repository review — 2026-10-04](docs/review-2026-10-04.md)

## Develop

Requires [pnpm](https://pnpm.io) (this repo pins `packageManager` in `package.json`).

```bash
pnpm install
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
- Full-bleed master (OS applies squircle on macOS): `resources/icon.png`
- Soft blue-gray vertical light, white code braces `{ }`, system-blue center dot
- Sparse metaphor, readable at 16–32px, no neon / no outer drop-shadow card

| Asset | Use |
|-------|-----|
| `resources/icon.png` / `icon.ico` | Window + installer |
| `src/renderer/src/assets/logo.svg` | Crisp in-app mark |
| `src/renderer/src/assets/logo.png` | Squircle-masked raster |
| `src/renderer/public/favicon.png` | Favicon |

## Security notes

- Renderer: `sandbox`, `contextIsolation`, no `nodeIntegration`
- Random / passwords: Web Crypto CSPRNG only (no `Math.random`)
- File hashing runs in the main process via a minimal preload API
