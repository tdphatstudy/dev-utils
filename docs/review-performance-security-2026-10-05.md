# Review performance và security — 2026-10-05

Phạm vi review ban đầu: code trên `feat/secret-box`, bao gồm các thay đổi UI/UX chưa commit. Findings và số dòng bên dưới là bằng chứng **trước khi sửa**, không mô tả lại trạng thái hiện tại. P1 là việc nên xử lý trước khi phát hành, P2 là việc cần xử lý ở đợt tiếp theo. Đợt triển khai tiếp theo được ghi riêng ở cuối báo cáo.

Đã đọc kiến trúc, review trước, các đường đi renderer → preload → IPC → service của vault, Keep, network, SSH và xử lý dữ liệu. Những bảo vệ đã triển khai ở đợt trước không được đưa lại thành lỗi chưa sửa.

## Findings

### 1. [P1][Security] Electron đang dùng đã hết hỗ trợ

- Vị trí: [package.json:72](../package.json#L72), [pnpm-lock.yaml:1690](../pnpm-lock.yaml#L1690).
- Manifest giới hạn Electron ở major 34; lockfile và bản cài thực tế đều là **34.5.8**. Electron 34 hết hỗ trợ ngày **23/06/2025** theo [lịch chính thức](https://releases.electronjs.org/schedule). [Trang phát hành 34.5.8](https://releases.electronjs.org/release/v34.5.8) cũng cảnh báo hết hỗ trợ.
- Tác động: runtime Chromium/Node/Electron không còn nhận các bản vá mới của nhánh được hỗ trợ. Sandbox không thay thế việc cập nhật runtime. Review này chưa chứng minh một exploit cụ thể trên ứng dụng.
- Sửa: nâng lên một major còn được hỗ trợ, đánh giá breaking changes và kiểm tra đóng/mở cửa sổ, preload, IPC, preview cùng installer trên các OS được hỗ trợ.

### 2. [P1][Performance/Security] File văn bản import và tài liệu `.putl` chưa có giới hạn đọc

- Vị trí: [export-import.ts:136](../src/main/secret-box/export-import.ts#L136), [export-import.ts:162](../src/main/secret-box/export-import.ts#L162), [fs-ops.ts:95](../src/main/secret-box/fs-ops.ts#L95), [crypto.ts:83](../src/main/secret-box/crypto.ts#L83).
- Import native đã `stat` file nhưng chỉ chặn kích thước ở nhánh media. Nhánh text gọi `readFile(..., 'utf8')` với bất kỳ kích thước nào. Đường đi này không qua giới hạn content của IPC `importPlain`. Đọc tài liệu thông thường cũng đọc toàn bộ `.putl`, parse JSON và giải mã đồng bộ; `listDir` dùng cùng đường đọc cho từng file trong thư mục.
- Tác động: chọn text quá lớn hoặc mở thư mục chứa một `.putl` rất lớn có thể làm main process tăng RAM mạnh, mất phản hồi hoặc hết bộ nhớ. Các bước JSON/string/Buffer/Base64 và hai lớp AES tạo thêm bản sao. Có thể kích hoạt khi chỉ mở thư mục vault, chưa cần chọn tài liệu.
- Sửa: đặt giới hạn byte riêng cho text và envelope, kiểm tra trên file handle và đọc có giới hạn kể cả khi file tăng kích thước sau `stat`. Kiểm tra shape envelope/payload và kích thước ciphertext trước khi cấp phát/giải mã. Giữ tương thích với media 40 MiB đang được hỗ trợ. Không thử gây OOM trên dữ liệu thật trong review này.

### 3. [P2][Security/Data integrity] CRUD chưa gắn với phiên mà renderer đã đọc tài liệu

- Vị trí: [ipc.ts:143](../src/main/secret-box/ipc.ts#L143), [ipc.ts:148](../src/main/secret-box/ipc.ts#L148), [fs-ops.ts:141](../src/main/secret-box/fs-ops.ts#L141), [KeepApp.tsx:212](../src/renderer/src/features/keep/KeepApp.tsx#L212).
- `readFile`, `writeFile`, `remove`, `rename`, export dùng đường dẫn tương đối, không mang box ID hoặc generation của phiên. `assertAccess` bảo vệ việc đổi phiên **trong một thao tác đang chạy**, nhưng thao tác mới bắt đầu sau khi đã đổi box sẽ lấy phiên mới. `saveDocument` có `boxId` riêng; lưu note đang tồn tại trong Keep không có bảo vệ tương đương.
- Tái hiện ở service thật với hai vault giả và hai tài liệu có cùng tên file `.putl`: đọc tài liệu từ A, đổi phiên sang B, gửi `writeDoc(oldDoc.relativePath, 'stale edit from A')`. Kết quả: **B.txt bị ghi nội dung của bản chỉnh sửa A**, không có `SESSION_CHANGED`.
- Điều kiện: renderer còn giữ request/tài liệu cũ, phiên đã đổi và đường dẫn tồn tại trong box mới; bản sao của một vault có thể giữ cùng các UUID tài liệu. Đây không phải việc giải mã một box chưa unlock. Chưa tái hiện trọn luồng UI Electron.
- Sửa: trả về token phiên từ unlock/status/read và bắt buộc token đó trong các thao tác vault; kiểm tra ngay đầu IPC và trước commit/return. Kiểm tra dữ liệu giữ nguyên ở cả hai box khi yêu cầu cũ đến sau đổi phiên.

### 4. [P2][Security] Khóa vault chưa được gắn với vòng đời cửa sổ ở main

- Vị trí: [index.ts:45](../src/main/index.ts#L45), [index.ts:187](../src/main/index.ts#L187), [index.ts:192](../src/main/index.ts#L192), [session.ts:11](../src/main/secret-box/session.ts#L11), [PrivateBoxApp.tsx:38](../src/renderer/src/features/privatebox/PrivateBoxApp.tsx#L38).
- Khóa AES nằm trong biến module của main, được xóa khi gọi `clearAccess` hoặc thay phiên. Main chưa có cleanup khi cửa sổ/webContents bị hủy hoặc renderer crash. Cleanup hiện phụ thuộc React unmount gửi IPC; đóng native window không bảo đảm React chạy cleanup.
- Tác động rõ nhất trên macOS: đóng cửa sổ cuối vẫn giữ main process, `activate` có thể tạo cửa sổ mới với phiên cũ còn unlock. Renderer crash cũng không bảo đảm xóa khóa. Chưa smoke-test native macOS trong review này.
- Sửa: gắn session với chủ sở hữu webContents và xóa khóa ở `closed`/`destroyed`/`render-process-gone`. Chốt riêng chính sách khóa khi máy sleep hoặc màn hình khóa; có thể bổ sung timeout nếu sản phẩm cần.

### 5. [P2][Security] Các lần xác thực đồng thời làm mất bộ đếm thất bại

- Vị trí: [auth-rate.ts:95](../src/main/secret-box/auth-rate.ts#L95), [auth-rate.ts:52](../src/main/secret-box/auth-rate.ts#L52), [ipc.ts:96](../src/main/secret-box/ipc.ts#L96).
- `recordAuthFailure` đọc → tăng → ghi, không có queue/lock theo vault. Nhiều request có thể đọc cùng giá trị cũ rồi ghi đè nhau. `assertNotLocked` và thử mật khẩu cũng chưa được gom thành một giao dịch xác thực duy nhất. Ghi state trực tiếp còn có thể để lại JSON lỗi; đọc lỗi hiện trả về state trống.
- Tái hiện với `Promise.all` của 5 lần `recordAuthFailure` trên root tạm: kết quả **failCount = 1, locked = false**. Test hiện tại chỉ kiểm tra 5 lần tuần tự.
- Tác động: giảm hiệu quả giới hạn thử mật khẩu khi request đồng thời được gửi từ renderer tin cậy. Đây là giới hạn ở lớp ứng dụng; người có quyền sửa file vault vẫn có thể thử khóa offline.
- Sửa: serialize cả thao tác xác thực theo vault, chặn request unlock đồng thời và ghi state atomic. Bổ sung test đồng thời, lỗi ghi và tương tác với clear-on-success.

### 6. [P2][Performance] KDF xác thực chạy đồng bộ trong main process

- Vị trí: [crypto.ts:40](../src/main/secret-box/crypto.ts#L40), [crypto.ts:168](../src/main/secret-box/crypto.ts#L168), [vault.ts:401](../src/main/secret-box/vault.ts#L401).
- Unlock thông thường dùng `scryptSync` cho hai layer key và hai verifier. Device mode có thể thử nhiều candidate. Việc bọc ngoài bằng hàm `async` không đưa các phép tính này ra khỏi event loop.
- Phép đo một lần portable unlock, chỉ derive + verify, mất **578 ms** trên máy review. Main sẽ không phục vụ callback/IPC trong phần đồng bộ đó; renderer vẫn có thể vẽ nhưng thao tác cửa sổ và IPC khác phải đợi. Recovery đã dùng KDF async; unlock/setup chưa dùng.
- Sửa: dùng scrypt async hoặc worker có giới hạn concurrency, giữ nguyên tham số KDF/format và kiểm tra generation sau khi await. Xóa các buffer key bị từ chối/hủy trong `finally`; không giảm độ mạnh KDF để lấy tốc độ.

### 7. [P2][Performance] YAML xử lý lại ba lần trên mỗi thay đổi input

- Vị trí: [YamlStudio.tsx:30](../src/renderer/src/features/tools/yaml/YamlStudio.tsx#L30), [yaml/index.ts:20](../src/shared/yaml/index.ts#L20), [TreeView.tsx:31](../src/renderer/src/components/ui/TreeView.tsx#L31).
- Mỗi input mới chạy `parseYaml`, `formatYaml` và `yamlToJson` đồng bộ trong render, kể cả output chưa được xem. Ba hàm đều parse lại dữ liệu. Tree còn stringify toàn bộ data để lấy 200 ký tự đầu và dựng toàn bộ row model trước khi virtualize DOM.
- Fixture YAML **256.670 byte, 5.000 record** mất **1.010 ms** cho ba phép biến đổi, chưa tính React, CodeMirror và Tree. File này nhỏ hơn nhiều so với mức 8 MiB mà Open file đang cho phép. `useMemo` chỉ tránh tính lại khi input không đổi.
- Sửa: parse một lần cho các kết quả phù hợp, chỉ tính output khi cần; debounce và đưa xử lý lớn vào worker với job ID/cancel. Giới hạn byte, node count/depth và cho phản hồi rõ khi vượt ngưỡng. Thay data key stringify bằng identity/version; virtualization cần giảm cả CPU tạo row model.

### 8. [P2][Performance] Keep giải mã mọi note hai lần và tải lại toàn bộ sau mỗi mutation

- Vị trí: [fs-ops.ts:67](../src/main/secret-box/fs-ops.ts#L67), [KeepApp.tsx:149](../src/renderer/src/features/keep/KeepApp.tsx#L149), [KeepApp.tsx:155](../src/renderer/src/features/keep/KeepApp.tsx#L155), [KeepApp.tsx:213](../src/renderer/src/features/keep/KeepApp.tsx#L213).
- `listDir` đọc/giải mã toàn bộ tài liệu để lấy tên/type, sau đó Keep lần lượt gọi `readFile` cho mọi note lần nữa. Save/create/delete đều gọi lại `loadNotes`. Toàn bộ body được giữ trong card state, lọc trên mỗi ký tự tìm kiếm và render danh sách chưa có virtualization.
- Phép đo service cho **200 note**, mỗi body 1 KiB: **400 lần giải mã, 1.458 ms**, chưa tính IPC hoặc render. Chi phí tải và mỗi lần lưu tăng theo tổng số note, kể cả khi chỉ đổi một note.
- Sửa: endpoint batch trả note phù hợp hoặc cache metadata/content trong RAM theo phiên; cập nhật card vừa mutation thay vì reload toàn bộ. Thêm pagination/virtualization khi inventory lớn. Xóa cache khi khóa/đổi phiên; không tạo index plaintext trên đĩa.

### 9. [P2][Availability] JSON hợp lệ nhưng lồng sâu làm formatter ném lỗi ngoài hợp đồng kết quả

- Vị trí: [json/index.ts:46](../src/shared/json/index.ts#L46), [JsonStudio.tsx:29](../src/renderer/src/features/tools/json/JsonStudio.tsx#L29).
- `parseJson` bắt lỗi JSON.parse, nhưng `formatJson` gọi sort đệ quy/JSON.stringify sau đó mà không bắt lỗi. JSON vẫn có thể parse được dù stringify hoặc recursion vượt stack.
- Tái hiện với **10.000 lớp array**, tổng input chỉ 20.001 ký tự: `formatJson` ném **RangeError: Maximum call stack size exceeded**. Gọi trong `useMemo` làm tool rơi vào ErrorBoundary thay vì hiện validation error; state editor trong cây bị lỗi có thể mất khi remount.
- Sửa: giới hạn depth/work và bắt lỗi của cả biến đổi để trả kết quả lỗi có cấu trúc. Dùng traversal lặp nếu cần hỗ trợ dữ liệu sâu. Giới hạn byte đơn thuần không bảo vệ tình huống này.

## Hardening bổ sung, chưa có exploit được chứng minh

- [index.ts:83](../src/main/index.ts#L83) chuyển mọi popup URL sang `shell.openExternal` chưa allowlist scheme và chưa xử lý Promise rejection. Main cũng chưa chặn `will-navigate`/redirect. Nên allowlist URL ngoài và navigation theo [hướng dẫn security của Electron](https://www.electronjs.org/docs/latest/tutorial/security). HTML preview hiện có sandbox rỗng và CSP chặn script/popup; không có bằng chứng HTML nhập vào đi tới handler này.
- [renderer/index.html:7](../src/renderer/index.html#L7) cho phép `connect-src` toàn bộ HTTP/HTTPS/WS/WSS ở cả production. Network tools hiện đi qua main nên production có thể siết xuống các nguồn cần thiết; chỉ mở WebSocket phục vụ HMR ở dev. Đây là giảm tác động nếu renderer bị compromise, chưa phải bằng chứng đang có upload hay exfiltration.
- Packaging chưa có pipeline signing/notarization hoàn chỉnh. Cần xử lý trước phát hành public và xem xét Electron fuses để giảm bề mặt tấn công. Không kết luận build hiện tại đã có chữ ký hay chống sửa đổi.

## Những bảo vệ đã xác nhận trong code

- BrowserWindow bật sandbox/context isolation/webSecurity và tắt Node integration; bridge là các method có tên cụ thể.
- Các IPC nhạy cảm kiểm tra main frame/URL renderer và phần lớn payload được validate runtime. HTTP/DNS/FileHash có giới hạn hoặc kiểm soát job; network là thao tác chủ động của người dùng.
- HTML preview không chạy script, không mở popup và không tải ảnh/font từ URL ngoài theo CSP riêng.
- Vault metadata đọc giới hạn, phân biệt mất/hỏng/không đọc được/không hỗ trợ; kiểm tra KDF params. Path guard chặn root/metadata và link thoát vault; các thao tác await đã có kiểm tra đổi phiên. Lỗi mục 3 là request mới đến sau đổi phiên, khác với các race đang được chặn.
- SSH edits bảo toàn cấu trúc, key generation có bảo vệ file/permissions; không thấy raw ipcRenderer hay arbitrary-command API được expose vào renderer.

## Kiểm chứng và giới hạn

- Đã chạy probe trực tiếp trên service/shared functions hiện tại với vault giả trong thư mục tạm. Không đọc hoặc sửa vault/SSH/userData thật. Các fixture và key đã được xóa; không đổi code sản phẩm trong đợt review.
- Timings là phép đo đơn trên Windows bằng **Node 24.19.0**, không phải benchmark thống kê hay profiling Electron/renderer. Electron đang ship Node 20.19.1; con số thực tế phụ thuộc runtime, dữ liệu và phần cứng. JSON 7.288.891 byte format mất 40 ms trong cùng probe; không suy ra mọi tool đều chậm như YAML.
- Chưa pentest, chưa thử gây OOM, chưa smoke-test vòng đời native macOS/Linux. Không chạy lại full suite/build vì chỉ thêm báo cáo; các kết quả kiểm tra của đợt UI trước không được xem là bằng chứng cho các finding mới.
- Quét advisory cho graph production + Electron **chưa chạy thành công**. Probe chuẩn bị gửi tên/phiên bản của 206 package (209 node version trong graph) tới `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`; sandbox chặn kết nối và automatic approval review từ chối escalation vì chưa có ủy quyền rõ cho việc tiết lộ metadata tới npm. Không gửi source, cấu hình hoặc dữ liệu vault. Không dùng đường khác để vượt chặn và không tuyên bố dependency sạch CVE. Dev-only dependencies chưa nằm trong graph dự kiến quét.

Thứ tự đề xuất: P1 runtime/file bounds → session ownership, lifecycle và auth queue → async KDF → YAML worker → Keep incremental loading → giới hạn độ sâu parser; sau đó hardening và kiểm thử native.

## Đã triển khai sau review — 2026-10-05

| Finding | Thay đổi | Bằng chứng regression |
|---|---|---|
| 1 — Runtime | Electron 44.5.1, lockfile pnpm giữ version đã resolve; macOS tối thiểu 13 | Typecheck/build, native Electron Windows smoke |
| 2 — File bounds | Text import 8 MiB, media 40 MiB, envelope 96 MiB; kiểm tra file handle/metadata, payload/encoding trước khi chấp nhận | Bounded-read tests, sparse oversized import, legacy text và binary/MIME round trip |
| 3 — Phiên CRUD | Session token bắt buộc trong mọi data IPC, kiểm tra owner/generation đầu và cuối request | Request A đến sau khi mở B bị từ chối; bytes ở B giữ nguyên, cả unit và native Electron |
| 4 — Lifecycle | Main xóa/zero key buffers khi owner đóng, destroyed hoặc renderer process gone | Lifecycle unit tests và native window destruction |
| 5 — Auth race | Một auth IPC tại một thời điểm, queue theo vault cho counter/reset, state ghi atomic; lỗi metadata fail closed | Năm failure đồng thời vẫn lock; reset ordering/corrupt state/overlapping auth |
| 6 — KDF | Setup/unlock/verifier dùng scrypt async, giữ tham số/normalization; keys bị từ chối được zero | Timers chạy trong derive/create/verify, tương thích verifier sync và session cancellation |
| 7 — YAML/Tree | Parse một lần trong worker, debounce 200 ms/deadline 5 giây; Tree dùng identity và cap 10.000 rows/paths | Shared YAML tests, UI worker/stale output smoke, production file-URL worker smoke, row budget test |
| 8 — Keep | Batch 200 file/8 MiB mỗi trang, một decrypt/note; mutation cập nhật card, Load more rõ phạm vi search | 201 notes + corrupt fixture phân trang không mất file; UI save không gọi lại batch |
| 9 — Deep JSON | Input/depth/node bounds; mọi lỗi format trả structured result | JSON 10.000 lớp array trả lỗi validation, không ném RangeError |

Hardening bổ sung đã triển khai: block external navigation/redirects, popup deny,
HTTP/HTTPS allowlist không có credential cho external links, production connect-src
và worker-src self. Sandbox/contextIsolation/webSecurity vẫn bật, Node integration
tắt. Không đổi format/salt của vault, không thêm telemetry hay persistent plaintext.

Electron 44 yêu cầu macOS 13+ theo [breaking changes chính thức](https://www.electronjs.org/docs/latest/breaking-changes).
Version đã chọn theo [release 44.5.1](https://releases.electronjs.org/release/v44.5.1);
không suy luận rằng nâng runtime đã chứng minh toàn bộ dependency sạch advisory.

Kiểm tra bản sửa:

- `pnpm test --maxWorkers=1 --fileParallelism=false`: **489 tests / 70 files pass**.
  Sau khi chỉnh fixture legacy cho contract TypeScript, chạy lại cả 6 crypto tests
  và xác nhận pass; không thay đổi behavior sản phẩm sau build.
- `pnpm typecheck` và `pnpm build`: pass bằng pnpm 10.33.4; build còn cảnh báo
  vendor SQL chunk khoảng 2,9 MB, vẫn chỉ được tải khi cần tool SQL.
- `node tests/electron-security.smoke.mjs`: pass trên **Electron 44.5.1 Windows**,
  kiểm tra production `file://` YAML worker/preload, token IPC cũ bị từ chối và B
  không bị ghi, external navigation/OS protocol popup bị chặn, native window
  destruction xóa/zero khóa. Native smoke dùng userData/vault tạm và xóa fixture;
  không mở vault thật.
- `tests/renderer-ux.smoke.mjs`: pass với Edge headless và production renderer.
  Dùng bridge fixture trong RAM để kiểm tra Keep save/retry/draft guards, mutation
  không reload inventory, worker YAML và stale output, focus/keyboard, viewport
  720×600, clipboard failure và explicit error recovery. Đây không phải native
  dialog/end-to-end test của tất cả tool.
- `git diff --check`: pass. Không sửa vault/SSH/userData thật trong đợt triển khai.

Giới hạn còn lại: chưa chạy installer/native macOS/Linux, native dialog/recovery UI
và sleep/idle locking chưa được xác nhận; signing/notarization/fuses chưa hoàn thiện.
File lớn hợp lệ vẫn cần RAM khi AES/JSON xử lý; bounds không thay thế streaming
format. Keep vẫn enumerate thư mục cho mỗi trang, search trên notes đã load và
manual Load more có thể tích lũy card. Counter queue là trong một process, không
chống nhiều app process hoặc người có quyền sửa state/kiểm tra mật khẩu offline.
Filesystem checks không phải lock chống external writers. Bulk advisory scan vẫn
chưa chạy do automatic approval review từ chối việc gửi package metadata tới npm
ở đợt review; không thử đường khác để vượt chặn.
