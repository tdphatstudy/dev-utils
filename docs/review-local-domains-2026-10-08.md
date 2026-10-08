# Review chức năng và Local Domains — 2026-10-08

Working tree sạch trước khi sửa. Rà soát từ registry `network.local-domains`
qua React UI, shared contracts, preload, trusted main IPC, service/proxy và
adapter hosts. Các lỗi dưới đây đã được sửa; không sửa hosts thật hoặc trust
store thật của người dùng trong lần kiểm tra này.

## Lỗi có bằng chứng

1. **[P1, đã sửa] Enable/Disable/cleanup từ chối file hosts thông thường vì giới
   hạn dòng lệnh Windows.** `src/main/platform/local-domains/hosts.ts:26`.
   Code cũ đưa toàn bộ hosts mới vào child script, rồi mã hóa UTF-16/base64
   child và wrapper UAC. Giới hạn 28.000 ký tự của wrapper bị vượt trước khi
   UAC chạy; file hosts chưa hề được sửa. Adapter mới truyền thao tác domain
   hoặc gỡ toàn bộ marker, kiểm tra hash snapshot đang khóa và hash kết quả
   mong đợi trước backup/ghi. Wrapper chỉ mã hóa child script. Command fixtures
   kiểm tra file gần 1 MiB, domain dài 253 ký tự và 2.000 domain mồ côi trên
   Windows/macOS/Linux; độ dài lệnh không tăng theo dung lượng hosts. Giới hạn
   file 1 MiB, kiểm tra ownership, backup và rollback vẫn được giữ.

2. **[P2, đã sửa] Enable bỏ qua hosts bị xóa ngoài app khi proxy vẫn active.**
   `src/main/local-domains/service.ts:110` và
   `src/renderer/src/features/tools/network/LocalDomainsTool.tsx:136`.
   Code cũ trả status ngay nếu proxy đã có route, khiến gọi Enable không sửa
   được hosts entry thiếu. UI bắt người dùng Disable rồi Enable lại. Hiện có
   **Restore hosts entry**: service giữ listener/certificate hiện tại, chỉ sửa
   hosts và clear resolver cache. Nếu quyền bị hủy, route đang chạy được giữ để
   retry hoặc Disable. Mapping đã hoạt động bình thường vẫn là no-op khi Enable
   lại. Unit test và Electron smoke kiểm tra cả sửa entry lẫn bảo toàn TLS route.

3. **[P2, đã xử lý trong UI/Open] HTTP trên `uctalent.app` không mở được trong
   Chrome dù hosts/proxy đúng.** `src/shared/local-domains/types.ts:73` và
   `src/main/local-domains/ipc.ts:37`.
   `.app`, `.dev` và `.page` có HSTS preload cho toàn đuôi, yêu cầu HTTPS theo
   [Google Registry](https://developers.googleblog.com/en/build-security-into-your-next-website/).
   UI giải thích khi nhập/lưu HTTP mapping và khóa Open; main Open cũng từ chối
   bằng thông báo cụ thể. Không đổi metadata/giao thức cũ: HTTP mapping vẫn có
   thể dùng qua client không áp dụng HSTS và vẫn Disable/Remove bình thường.
   Danh sách này không bao phủ mọi domain hoặc HSTS state riêng của browser.

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| `pnpm test --testTimeout=30000 --maxWorkers=1 --fileParallelism=false` | 108 files, 1.023 tests pass |
| `pnpm typecheck` | Main/preload/shared và renderer pass |
| `pnpm build --logLevel warn` | Pass; vẫn có warning chunk trên 900 kB |
| Windows helper trên file TEMP | Thêm, enable lại, disable, cleanup giữ nguyên bytes UTF-8/raw Latin1/newline; backup đúng; stale snapshot, deadline hết hạn và result hash sai bị từ chối |
| `tests/local-domains-ui.smoke.mjs` | Save/enable/open/copy/disable/remove, repair, HTTP `.app`, cancellation/busy/focus, recovery và metadata corrupt pass |
| `tests/electron-local-domains.smoke.mjs` | Production preload/trusted IPC và proxy HTTP/TLS tới upstream chỉ IPv6; repair không cấp lại certificate; route sống khi đóng mọi cửa sổ; reopen/cleanup/remove pass |
| `tests/ux-review-ui.smoke.mjs` | 50 routes × 2 theme × 2 viewport (200 views): không crash/overflow; contrast và window/favorite controls pass |
| `tests/advanced-tools-ui.smoke.mjs` | 4 tool phân tích dùng worker production: schema/API/drift/logs, import/cancel/timeout/retry và privacy pass |
| `git diff --check` | Pass |

Electron smoke dùng profile riêng, memory-hosts và TEST-ONLY TLS pair. Log thiếu
`security:state`/`app:language` thuộc fixture tối giản; log từ chối IPC untrusted
là tình huống test chủ động. Không phải lỗi thiếu handler trong app production.

## Giới hạn và cách kiểm tra lại

UAC thật, flush DNS thật, mkcert/trust store thật, Chrome của người dùng và native
macOS/Linux chưa được smoke trực tiếp. Catalog UI sweep chứng minh khả năng mở
và layout của tool; không chứng minh mọi thao tác OS/network của cả 50 tool đã
hoạt động end-to-end. Test suite bao phủ hành vi hiện có, không phải audit toàn
bộ sản phẩm. Browser cache, service worker, dev-server Host allowlist và target
port không chạy vẫn là nguyên nhân riêng cần kiểm tra khi có lỗi cụ thể.

Đã build lại `out` bằng lệnh chuẩn. Thoát hẳn bản app đang chạy (kể cả tray) rồi
khởi động lại để nạp main/preload mới. Với `uctalent.app`, Remove HTTP mapping,
lưu lại với **Use HTTPS**, chạy **Setup HTTPS** rồi Enable; nếu chỉ cần HTTP,
dùng `uctalent.test` → port 3000. App đích phải đang chạy; upstream vẫn là HTTP.

Không thêm dependency, telemetry, background upload hoặc migration storage.
