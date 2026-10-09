# Interface copy review — 2026-10-09

This is the earlier copy-review baseline. Later helper localization, coverage and
release checks are recorded in [release fixes](release-fixes-2026-10-09.md).

This review covers English source copy and Vietnamese interface terminology in
Home, Settings, tool guides, tool descriptions, quick windows, Clipboard Manager
and OCR. Existing quick-window theme, paste and inline OCR changes are retained.

## Copy conventions

- Name the action directly: Copy, Paste, Save, Export, Clear. In Vietnamese use
  Sao chép, Dán, Lưu, Xuất and Xóa consistently.
- Use Bộ nhớ tạm, Cửa sổ nhanh, Khay hệ thống and Thanh bên for interface parts.
  Preserve technical identifiers such as JSON, Base64, OCR, UUID, HTTP, JWT and
  SSH. Use kiểm thử tải, giá trị băm, mã truy vết and yêu cầu HTTP in explanatory
  Vietnamese text.
- Separate Favorites, Pin entry and Keep window open. Pinned clipboard entries
  still expire.
- State the supported operation and its limits. JWT policy review does not verify
  signatures. A network tool runs after an explicit action. OCR opens local files;
  calling this Upload incorrectly suggests a remote operation.
- Empty states explain the next action. Loading and failure messages describe the
  operation and a usable recovery step. They do not expose Electron IPC prefixes.
- Keep tool session history, clipboard history and encrypted vault files distinct.
  Clearing session history does not clear clipboard history. Clipboard history is
  recorded while capture is enabled; encrypted persistence is a separate setting.
- Recognition confidence is an estimate from OCR, not guaranteed text accuracy.
  The result remains editable and should be reviewed before use.

## Changes

Reviewed 180 existing Vietnamese messages and 36 tool descriptions. Replaced
generic English introductions and empty states with concrete labels and task
instructions. Added missing translations for common quick-window actions,
clipboard states, OCR options and navigation labels. Every added catalog message
has entries for all supported languages and preserves its interpolation fields.

The English and Vietnamese review is editorial. Completeness checks for the other
languages verify catalog entries and interpolation; they are not a native-speaker
review. At this review stage, native screen selection and result helpers retained
English-only copy. The subsequent release fixes localize their finite interface
messages in all 13 supported languages.

## Verification

`pnpm test --maxWorkers=2`: 125 files and 1,108 tests passed. The first full run
overlapped with build and type checking and failed seven tests on time limits or
Windows process-name lookup. All seven files passed separately before the full
rerun. No test limits or application logic were relaxed to pass them.

The catalog and error-message tests also passed after the final copy changes.
UI checks cover 13 languages, live language switching without changing user
input, clipboard actions and inline OCR, OCR cancellation and edited output,
color picking, Mock API/HTTP controls and compact light/dark layouts. Vietnamese
OCR output is copied unchanged even when it contains literal HTML or words that
are also interface labels.

`pnpm typecheck` and `pnpm build` passed after the final source changes. Existing
large-bundle warnings remain. Visual inspection covers Vietnamese clipboard and
OCR screens; the UI review also checks all 51 routes in light/dark mode at
1180×760 and 720×500, including contrast and the Favorites action.

Navigation and loading checks passed, including palette focus, slow loading,
failed-tool recovery and logical zoom through 200%. The Electron OCR smoke test
with `--inline-only` passed using real bundled English/Vietnamese recognition
models; it did not capture the user’s screen.

Unit and mocked UI tests do not establish native Word paste, desktop capture
permissions or support on unavailable platforms.
