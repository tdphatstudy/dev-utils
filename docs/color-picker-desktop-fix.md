# Color Picker: desktop-wide selection and result popup

The first tray picker opened EyeDropper in a small Electron helper. Checking that
the API existed did not prove that it could select a pixel outside that window.
The reported workflow also needed a result popup and format choice, rather than
automatic HEX copying. This change replaces that implementation.

## Behavior

1. Choose **Pick screen color…** from the tray or **Pick screen color** in the app.
2. Capture the currently visible OS desktop into RAM before any overlay opens.
   Each display gets a full-display overlay, including other applications and
   the taskbar. A magnifier shows the pixel and its HEX. Click selects; Esc cancels.
3. Destroy all snapshot overlays and show a small result popup with a color
   preview, **HEX/RGB/HSL/HSV**, individual **Copy** buttons, **Repick** and Close.
   Selection itself leaves the clipboard unchanged.
4. Repick closes the popup and captures a fresh desktop snapshot. Esc while
   repicking restores the previous color popup. Close/Esc in the popup destroys it.

This is snapshot selection: animations and other applications are frozen in the
overlay until selection/cancel. It does not continuously record or monitor the
screen. The main Color Picker receives selected colors and also provides all four
formats. HSV is a color representation, not a CSS color function.

## Boundaries and memory

`src/main/screen-snapshot.ts` maps captured source `display_id` to Electron display
IDs, never enumeration order. Capture sizes use physical pixels; overlay bounds
use DIP coordinates, including negative origins. Canvas maps clicks into the
actual image dimensions for DPI scaling. Windows/Linux overlays use fullscreen;
Windows thick frames are disabled to prevent work-area/taskbar clipping. macOS
uses frameless display bounds and the screen-saver window level.

The [Electron capture API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
requires screen-recording permission on macOS, and some Linux PipeWire portals
return only one source. Multi-monitor capture without unambiguous IDs is refused
rather than guessed. Full-resolution thumbnails are required. See
[source display IDs](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source)
and [DIP/physical screen coordinates](https://www.electronjs.org/docs/latest/api/screen).

Capture is limited to eight displays, 64 million total requested/decoded pixels
and 128 MiB encoded snapshots. Selection has a two-minute deadline; helper loading
has a 15-second deadline. Snapshot images never go to disk, logs, generic drafts,
history or network. They are released with their overlays after selection/cancel.
Display changes, owner destruction and Quit cancel current work. RAM increases
during capture and the result popup owns one temporary renderer until closed;
there is no persistent hidden picker or full toolbox window.

The helper uses `src/preload/color-picker.ts`, built separately as
`out/preload/colorPicker.js`, and small local HTML/JS resources. No toolbox bridge,
raw IPC, arbitrary clipboard payload or arbitrary command is exposed. Helper IPC
checks the active WebContents, main frame, exact resource URL and overlay/result
mode; selected HEX and Copy format are validated. Clipboard content is derived
from the selected color in main. Sandbox/contextIsolation/webSecurity remain on,
Node integration stays off, and CSP allows only local JS and data images.

## Verification

Final checks on Windows, 2026-10-05:

- `pnpm typecheck` and `pnpm build`: pass; helper preload is 0.47 kB and the main
  Color Picker stays a lazy chunk around 7 kB. Existing vendor SQL chunk warning
  remains (about 2.9 MB).
- `pnpm test --maxWorkers=1 --fileParallelism=false --testTimeout=15000`:
  **507 tests / 76 files pass**. Default 5-second runs had one timeout in the
  existing multi-KDF key-verifier test (506/507 pass); the isolated six crypto
  tests and the full suite passed with the longer CLI deadline. Crypto source and
  repository timeout configuration were not changed for this picker fix.
- `git diff --check` and local documentation/resource path checks: pass.

- Focused tests cover multi-display bounds/source mapping, mixed DPI/negative
  origins, snapshot limits, cancellation/timeouts, owner/display cleanup, Repick,
  malformed inputs, stale helper IPC, foreign windows/subframes and clipboard errors.
- `tests/color-picker-ui.smoke.mjs` verifies the four Copy actions, clipboard
  retry, Repick/Esc, popup bounds and a scaled overlay pixel outside popup bounds.
- `tests/electron-color-picker.smoke.mjs` runs the real controller, desktop capture
  and sandboxed production helper preload on Windows. It places a known-color
  fixture window near the screen corner, selects its pixel outside the old helper
  bounds, checks the result popup, then Repick → Esc → Close. No desktop image is
  exported, clipboard is not read/written, and all fixture/helper windows are removed.
- App renderer regression covers the new result contract and four-format tool UI.

Actual Windows OS selection passed. Physical multi-monitor desktops, macOS,
Linux/X11/Wayland and native permission dialogs still need platform testing.
Protected OS/DRM surfaces may not be capturable. Capture failures keep the manual
color tool available and do not silently return a different screen's pixel.
