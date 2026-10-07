# DevFusion — UI/UX, motion và enterprise readiness, 2026-10-06

Đã review và triển khai cải tiến trong app Electron hiện có. Mục tiêu là nâng
chất lượng công cụ desktop local-first; kết quả này không phải chứng nhận bảo mật
hay xác nhận đã hoàn thành mọi điều kiện triển khai doanh nghiệp.

## Kết quả thiết kế

- Chrome, command palette và shared dialog dùng lớp kính có nền đậm đủ đọc,
  blur giới hạn 20 px và highlight nhẹ. Editor/document giữ surface đặc.
- Home có ba workflow: API/debug, kiểm tra release, hạ tầng. Chúng mở tool có
  sẵn theo nhu cầu, không tự chạy network hoặc preload tool.
- Entrance của page/dialog dài 180 ms; hover card dịch 2 px; giữ feedback nút,
  segmented control và sidebar. Không thêm vòng animation JavaScript hoặc
  animation nền liên tục.
- Settings có Liquid Glass/Solid và Follow system/Reduced; lưu metadata được
  validate cùng preferences cũ. Reduced motion của OS luôn được ưu tiên.
- CSS reduced transparency/higher contrast bỏ blur khi Chromium cung cấp media
  feature đó. Solid là lựa chọn trực tiếp trên mọi host. Đây là CSS mô phỏng
  phong cách macOS; chưa phải integration Liquid Glass native.
- Các grid mới dựa trên chiều rộng workspace, không chỉ chiều rộng cửa sổ.

Hướng thiết kế lớp vật liệu và accessibility tham khảo
[Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
Không tuyên bố compliance WCAG toàn app chỉ từ một số phép đo màu.

## Tiện ích mới cho công việc developer

**Environment Compare** (`security.env`) hỗ trợ review cấu hình staging/production:
paste hai `.env`, Compare hoặc Ctrl/⌘ Enter, xem biến missing/extra/changed/same và
Copy report. Report chỉ chứa tên biến và status; không có giá trị.

Inputs chỉ ở component RAM, không generic draft/history/persistent preferences;
đổi input hủy kết quả cũ, Clear hoặc rời tool bỏ state. Không tự đọc clipboard,
deployment files hay kết nối môi trường production. Tên biến vẫn là metadata và
nút Copy report là xuất dữ liệu ra clipboard theo yêu cầu.

Parser có giới hạn 256 Ki UTF-16 characters và 5,000 lines cho mỗi input. Hỗ trợ
KEY=value, export prefix, comments, BOM/CRLF và quoted multiline. Không interpolate
variables, decode escapes hay execute shell. Đối chiếu literal sau khi bỏ enclosing
quotes; vì thế nó không đảm bảo giống semantics của mọi dotenv loader/shell.
Unsupported syntax báo line number mà không echo credentials. Duplicate được báo
và dùng assignment cuối. Input mẫu dùng domain example.test và không gọi mạng.

Đợt bổ sung tiếp đã triển khai JSON Schema Validator và Data Reconciliation trong
JSON, API Contract Review trong Network, Structured Log Explorer trong Text / Dev.
Chúng hỗ trợ payload/event contracts, review thay đổi API trước release, đối chiếu
export theo business key và điều tra JSONL theo trace/service/latency. Không tạo
group Enterprise riêng. Xem [advanced developer tools](advanced-developer-tools.md)
cho workflow, chuẩn hỗ trợ, privacy và giới hạn phân tích.

SQL migration/DDL review, SBOM, certificate chain inspection và secret scanning
còn là các hướng tiếp theo cần thiết kế theo workflow thực tế. Không thêm cloud
integrations, SSO hay agent platform vào toolbox này chỉ để gắn nhãn enterprise.

## Findings bảo mật và độ tin cậy

| Mức | Vị trí / hiện trạng | Ảnh hưởng và xử lý |
| --- | --- | --- |
| P2, đã sửa | `src/main/index.ts`, `window-security.ts`: main session thiếu explicit permission handlers | Browser/device API chưa có policy thống nhất. Nay deny request/check/device permissions, chỉ cho sanitized clipboard write từ exact app main frame; reject webview attachment. Đây là hardening, không phải exploit đã chứng minh. |
| P2, đã sửa | `src/main/tray.ts`, `ocr.ts`, `color-picker.ts`: không chờ `clipboard.writeText()` Promise của Electron 44 | Có thể báo copied quá sớm hoặc bỏ qua async failure. Nay main trả/await Promise để existing error UI xử lý; tray báo lỗi generic không echo nội dung. |
| P1, còn cần credentials và rollout QA | `electron-builder.signed.yml`, `scripts/after-pack.mjs`, `.github/workflows/signed-build.yml` | Đã áp dụng/đọc lại fuse policy, thêm signed profile fail-closed và workflow artifact có kiểm tra signature/notarization. Chưa có chứng chỉ hoặc signed artifact để xác nhận release thực tế. Local build vẫn unsigned; chưa có automatic updater. |
| P2, đã triển khai | `src/main/vault-auto-lock.ts`, renderer lock boundary/recovery hooks | Idle 5/15/30/60 phút (mặc định 15), suspend và OS screen-lock được báo sẽ hủy session/IO và zero main keys. UI được mask/remount; document/Keep/composer chưa lưu có checkpoint AES-GCM chỉ trong RAM, yêu cầu xác thực lại đúng owner/root và Restore rõ ràng. Capture lỗi giữ draft ẩn để Retry/Discard, không tự ghi đè file. |
| P2, đã thêm cấu hình / chưa chạy remote | `.github/workflows/quality.yml` | Matrix Windows/macOS/Linux chạy typecheck/test/build, UI/native smoke, package/fuse checks và ASAR fixture smoke. Action được pin SHA, permissions chỉ đọc. Session này chỉ chạy Windows; remote CI và native QA OS khác còn cần thực hiện trước rollout. |
| P2, đã triển khai | `src/renderer/src/store/session-store.ts`, Settings | Tool input retention Off xóa cache/history và chặn cả delayed flush. Preference được validate khi hydrate; không hydrate payload. Inputs của editor đang mở vẫn tồn tại đến khi rời tool, denylist sensitive luôn áp dụng. Đây là tùy chọn local, chưa là policy do MDM quản lý. |

Permission request và permission check phải được xử lý cùng nhau theo
[Electron Session API](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler).
Main IPC sender/payload guards, sandbox/context isolation/web security, navigation
allowlist và production CSP được giữ. Không đổi vault salt/format/root, không
migrate dữ liệu hay log decrypted payload. Các lỗi preservation/SSH của review
2026-10-04 đã có fixes/tests trong code hiện tại; không coi chúng là lỗi còn mở
chỉ vì tồn tại trong tài liệu cũ. Filesystem checks vẫn có external replacement
races như architecture đã ghi.

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| `pnpm test --maxWorkers=4` | 96 files, 899 tests pass; gồm 42 tests domain mới và privacy cho 4 tool |
| `pnpm typecheck` | Node + renderer pass |
| `pnpm build` | Main/preload/renderer pass; SQL chunk warning còn tồn tại |
| `enterprise-ui.smoke.mjs` | Glass/Solid, preference hydration, explicit/OS reduced motion, `.env` compare/copy/invalidation/clear-on-navigation; không page errors |
| `vault-lock-ui.smoke.mjs` | Document, Keep edit/unknown fields và composer được khôi phục sau xác thực, không auto-save; repeated locks/capture failure/Retry, portal masking, retention Off và stale state response không bỏ close guard của draft mới pass trên renderer production |
| `ux-review-ui.smoke.mjs` | 45 routes × light/dark × 1180×760/720×500; không control overflow/crash; các token contrast/button fill/input edge tests pass |
| `advanced-tools-ui.smoke.mjs` | Cả 4 tool với production workers; import UTF-8, stale file-read cancellation, report privacy, filters, Cancel, regex timeout/retry và navigation clearing |
| `keep-ux-ui.smoke.mjs` | Delete/Cancel focus, nested focus trap, Escape, failed delete/retry, busy/double-submit/session guards pass; 69 contrast checks, tỷ lệ thấp nhất 5.22 |
| `electron-security.smoke.mjs` | Electron 44.5.1 trên Windows; permission checks, stale session refusal, event suspend mô phỏng/key zeroing, recovery IPC yêu cầu xác thực lại, navigation/protocol guard và zeroing khi close |
| `pnpm test:electron:packaged` | Native fixture trong ASAR với fuse policy production pass trên Windows; YAML và 4 worker mới/IPC hoạt động, `ELECTRON_RUN_AS_NODE` và `NODE_OPTIONS` bị vô hiệu hóa |
| `pnpm exec electron-builder --dir --publish never` + `pnpm verify:package release/win-unpacked/DevFusion.exe` | Bản Windows x64 unsigned cuối đóng gói thành công; đọc lại fuse policy pass |
| Workflow YAML / action references | Parse thành công, permissions chỉ đọc, action references pin SHA 40 ký tự; chưa chạy GitHub Actions remote |
| `git diff --check` | Pass |

Browser smoke chạy production renderer với native operations unavailable/fixtures;
native security smoke dùng profile và vault tạm, không vault thật. Packaged smoke
dùng fixture main và renderer/preload production trong ASAR; chưa thay thế kiểm
thử toàn app đã cài hoặc signed installer. Không khóa/suspend OS thật trong smoke.
Clipboard smoke
kiểm tra quyền và đọc bị từ chối, không ghi/đổi clipboard hệ thống. Native Copy
completion/rejection được kiểm tra qua service tests; chưa manual QA mọi popup.
Đã xem screenshots Home dark và Environment Compare light; ảnh và catalogue
report lưu ở thư mục visualization của chat, không làm source dependency.

Hai lần chạy full suite mặc định đã phát hiện flakes hiện có: một lần `tasklist`
không trả process name trong Windows port integration khi tải cao; test đó pass
khi chạy riêng. Một lần Local Domains fixture chọn trùng HTTP/HTTPS do đóng
listener giữa các lần `listen(0)`. Đã sửa fixture giữ cả ba port reservations
đến khi chọn xong; không nới validation production hoặc bỏ assertion. Suite cuối
giới hạn 4 workers đã pass đầy đủ. Không xem các lần thất bại là pass.

Lệnh tái chạy:

```sh
pnpm test --maxWorkers=4
pnpm typecheck
pnpm build
node tests/enterprise-ui.smoke.mjs
node tests/vault-lock-ui.smoke.mjs
node tests/ux-review-ui.smoke.mjs
node tests/advanced-tools-ui.smoke.mjs
node tests/electron-security.smoke.mjs
pnpm test:electron:packaged
pnpm exec electron-builder --dir --publish never
pnpm verify:package release/win-unpacked/DevFusion.exe
```

Browser smoke nhận `PLAYWRIGHT_MODULE` cho module Playwright hiện có,
`UX_BROWSER_CHANNEL` cho browser hiện có và `BRAND_SCREENSHOT_DIR` cho ảnh/report.
Không thêm dependency production. Đợt implement tiếp thêm đúng hai dev dependency
`playwright` và `@electron/fuses`, pin version và cập nhật lockfile. Các tool mới
thêm dependency production `@cfworker/json-schema` 4.1.1 (không dependency bắc cầu)
để validate schema không cần eval hoặc nới CSP. Tests trong
sandbox gặp EPERM khi pnpm/Vite realpath dependencies; các lần chạy có kết quả dùng
cùng pnpm 10.33.4 ngoài sandbox với approval của môi trường.

Chưa chạy macOS/Linux native smoke, installer installation, signed artifacts, penetration
test hay đo GPU/RSS của glass. SQL vendor chunk vẫn lớn (~2.9 MB) và lazy-load;
không có đo performance để khẳng định glass làm app nhanh hơn.

Chi tiết cấu hình signing/CI, auto-lock/privacy, recovery limits và staged rollout
nằm trong [enterprise delivery runbook](enterprise-release.md). Không thay vault
format, salts, device secret hoặc tự migrate tài liệu. JavaScript strings không
thể zero chắc chắn; RAM recovery mất khi process/app dừng. OS screen-lock phụ
thuộc platform; Linux cần kiểm chứng desktop integration. Fuse tương thích file
được giữ vì renderer offline hiện dùng file://; tắt nó đã làm native ASAR load
thất bại và cần migration protocol có kiểm chứng riêng trước khi bỏ.
