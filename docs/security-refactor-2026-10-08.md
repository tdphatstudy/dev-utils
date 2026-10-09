# Refactor và hardening — 2026-10-08 / 09

## Phạm vi và ranh giới

Đợt này kiểm tra đường vào IPC, lifecycle của quick widgets, clipboard, registry/
legacy vault, SSH/config/key generation, ảnh QR/convert/OCR và RAM draft/history.
Đối chiếu các guard HTTP/DNS/file hash, Mock API/local proxy, vault session/path,
authenticated encryption, window recovery và fuse/signing policy đã có. Đây là
review code và regression trên fixtures; không phải chứng nhận pentest toàn app.

Tài sản cần bảo vệ là key/decrypted content, clipboard history, metadata và file
mã hóa, SSH keys/config, quyền OS và tài nguyên main/renderer. Dữ liệu nhập, ảnh,
file trên disk và IPC payload không được tin cậy chỉ vì có TypeScript type.
Renderer chỉ dùng named preload methods; main kiểm tra caller và payload trước
khi gọi service. Mạng vẫn chỉ chạy qua thao tác của user, không thêm telemetry.
Các yêu cầu Electron về sandbox, context isolation, IPC sender và navigation được
đối chiếu với [hướng dẫn chính thức](https://www.electronjs.org/docs/latest/tutorial/security).

## Findings đã sửa

| Mức | Vấn đề và tác động | Thay đổi / regression |
|---|---|---|
| P1 | Quét vault legacy không có verifier bắt lỗi đọc thư mục rồi coi là rỗng; có thể bind verifier cho mật khẩu sai, làm mất đường mở dữ liệu cũ | `secret-box/legacy-proof.ts` stream `opendir`, lỗi đọc/link/đổi phiên là refusal; tối đa 20.000 entries, depth 64. Test `accessVault` với EACCES giữ nguyên metadata và ciphertext, không mở phiên; hidden `.putl` cũng được lấy làm proof |
| P2 | QR và Image Convert đọc kích thước sau khi browser đã decode bitmap; file nén nhỏ với pixel dimensions rất lớn có thể gây áp lực RAM/crash renderer | `shared/image/validation.ts` kiểm tra signature/header trước `Image`, blob URL hoặc `createImageBitmap`; giới hạn 32 MiB, 16 triệu pixels. Convert 8.192/side, QR/OCR 16.384/side. QR canvas decode giảm còn 1.600/side, encode tối đa 2.048/side kể cả scale; giải phóng canvas, image source và blob URL |
| P2 | Registry, legacy pointer/device-secret và SSH config còn có read-all hoặc stat/read race | Dùng `readBoundedFile`: file handle ổn định, regular file, không follow link, kiểm tra growth/replacement, giới hạn trước allocation. Registry 1 MiB/1.024 entries, pointer 16 KiB, device secret/cache 64 KiB, SSH config 2 MB. Registry write cũng validate/bound trước khi thay thế; lỗi không reset recovery material |
| P2 | Burst IPC có thể tạo nhiều scan/TCP/keygen/read jobs hoặc queue giữ payload | `IpcTaskPool` từ chối ngay khi đầy, không tạo backlog. Vault/SSH tối đa 4 jobs/domain; keygen 1 chung giữa SSH và standalone; port operation 1; tạo widget 1; clipboard copy 1 chung quick/main, clipboard settings/clear 1; shortcut save 1. Lock vault, Pause capture và OCR cancel vẫn có đường gọi riêng. Tests burst, release sau failure và Lock khi vault pool đầy |
| P2 | Draft store giới hạn history count nhưng chưa giới hạn độ lớn tổng draft | Mỗi draft tối đa 1.048.576 UTF-16 characters, tổng 4.194.304, tối đa 40 drafts theo lần cập nhật gần nhất; history 40 snippets × 200 chars, labels 100 chars. Input lớn vẫn dùng trong tool đang mở; không truncate/lưu một draft lỗi thời. Privacy denylist và tùy chọn tắt retention được giữ |

Các refusal trả lỗi để UI xử lý, không tự retry tạo queue hay xóa dữ liệu. PNG/GIF
signature check được dùng chung cho OCR; fixture OCR cũ chỉ có bốn byte đầu PNG
được sửa thành đủ tám byte signature, không nới guard để test pass.

## Tổ chức source

- `src/main/quick-tools/{service,window,security,ipc,index}.ts`: orchestration,
  window geometry/options, permissions/resource policy và named IPC.
- `src/main/clipboard/ipc.ts`: clipboard handlers thuộc domain clipboard, với
  access contract nhỏ; không cần import service UI hoặc expose raw IPC.
- `src/main/secret-box/registry.ts`: registry IO/validation/transaction queue;
  `vault.ts` giữ auth và orchestration. Export `readRegistry` cũ vẫn hoạt động.
- `src/main/secret-box/legacy-proof.ts`: proof scan có budget và session checks.
- `src/shared/image/validation.ts`: validation thuần, dùng bởi QR/Convert/OCR;
  export `validateImageSize` cũ của OCR được giữ để tương thích.

Tool IDs, preload contracts, tên file trên disk và envelope version không đổi.
Không thêm dependencies hoặc migrate vault. Dọn comment lặp lại code, sửa comment
atomic write đang mô tả sai durability; giữ ghi chú safety, compatibility và license.
Rollback code không cần chuyển đổi dữ liệu; refusal về size/link không xóa file.
Không dùng bản cũ để vượt refusal legacy proof trước khi kiểm tra backup, vì lỗi
coi thư mục không đọc được là rỗng vẫn tồn tại ở bản cũ.

## Giới hạn còn lại

- Không thể cam kết tuyệt đối không crash/OOM hoặc không bị hack. Giới hạn input
  và số jobs là admission bounds, không phải hard cap toàn RAM của Electron/GPU.
  File hợp lệ lớn và OCR models vẫn tốn RAM; schema mã hóa hiện tại chưa streaming.
  Header checks không thay thế việc cập nhật decoder/runtime khi có CVE.
- AES-GCM từ chối ciphertext/tag bị sửa. Không có manifest/version anchor ở nơi
  tin cậy bên ngoài để chống xóa file, rollback hoặc thay bằng ciphertext hợp lệ
  bởi người có quyền ghi OS. Filesystem checks không tạo lock với writer ngoài app.
- Registry/settings là metadata local có validation, không có signature chống
  người cùng OS account chỉnh sửa. Không tự đổi storage format trong refactor này.
- Legacy proof vẫn kiểm tra tối đa năm tài liệu như contract trước; không phải
  integrity scan mọi tài liệu. Vault legacy có link/quá budget cần user kiểm tra
  folder/backup trước; metadata không bị tự sửa để vượt lỗi.
- [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses) và signing
  policy đã có trong repo. Đợt này chưa tạo/kiểm chứng installer ký số hoặc ASAR
  tamper test; không coi build development là bản phát hành chống sửa đổi.
- Chưa hoàn tất dependency advisory audit; chưa có cơ sở kết luận graph sạch CVE.
  Không gửi package metadata/source/dữ liệu user ra dịch vụ audit trong đợt này.
- Native macOS/Linux chưa được chạy. Test dùng temporary profiles/vaults và dữ
  liệu tạo sẵn; không đọc/sửa vault, SSH, hosts hoặc clipboard thật của user.

## Khi có sự cố / thay key

Nếu nghi máy hoặc bản cài bị can thiệp: đóng vault, dừng mock/proxy/capture, giữ
backup nguyên bản của ciphertext và metadata, rồi kiểm tra trên máy/bản cài tin
cậy. Không xóa salts/device-secret, không reset metadata và không ghi đè backup
để “thử sửa” lỗi decrypt. Khôi phục từ backup đã xác minh, giữ bản lỗi để đối chiếu.

App chưa có key rotation tại chỗ. Nếu key/password có khả năng lộ, tạo vault mới
với key/password mới trên máy sạch; chuyển tài liệu bằng export/import chủ động,
kiểm tra từng tài liệu ở vault mới trước khi xử lý vault cũ. Export plaintext là
thao tác riêng có rủi ro; chỉ thực hiện trong vị trí bảo vệ phù hợp, không ghi key
vào settings/log. Credential đã copy từ vault/clipboard phải được thu hồi/thay
ở hệ thống phát hành credential; đổi vault key không tự thu hồi token/SSH keys.

## Kiểm chứng

| Kiểm tra | Kết quả |
|---|---|
| Focused regression | 85 tests ban đầu; 34 tests OCR/QR/image/window/registry sau khi sửa PNG fixture |
| Full Vitest | 119 files / 1.087 tests pass, một worker, timeout 20s (native hosts fixtures có timeout riêng) |
| Ciphertext tamper regression bổ sung | 7 crypto tests pass, gồm test mới sửa ciphertext/tag/IV và xác nhận envelope gốc vẫn decrypt được |
| Typecheck / production build | Pass; SQL vendor chunk vẫn ~2,9 MB, là warning cũ và lazy loaded |
| `image-resource-ui.smoke.mjs` | Edge production renderer: header bomb bị từ chối trước bitmap/Image/blob allocation, QR preview không đi vòng qua guard; ảnh hợp lệ vẫn convert được sau refusal |
| `quick-tools-ui.smoke.mjs` | Production quick widgets, copy/search/merge/masking, JSON/Base64/QR round trip, OCR/Mock fixture, EN/VI/AR, 420/620/760 px, không external traffic |
| `electron-quick-tools.smoke.mjs` | Actual sandbox preload/file URL, fixed targets, shortcut registration khi mọi cửa sổ đóng, encrypted history dùng OS, cleanup; clipboard thật không đổi |
| `electron-security.smoke.mjs` | Native sender/navigation/session guard, stale mutation không đổi box B, suspend invalidates keys, mô phỏng renderer crash phục hồi một workspace/main vẫn sống, owner destruction zero keys |
| `electron-ocr.smoke.mjs` | Actual local PNG, English/Vietnamese models, PDF text/scanned/force, cancellation, region/full-screen app-owned fixture, popup/engine cleanup; 0 idle renderer |
| Diff / paths | `git diff --check` pass; source module/architecture paths cập nhật |

Full suite được chạy trước thay đổi vị trí QR preview cuối; thay đổi UI đó đã qua
typecheck/build và cả UI smoke có instrumentation trên bản production. Lần full
đầu bắt sáu fixture OCR dùng signature PNG chưa đủ; sau khi sửa fixture, toàn bộ
suite đã pass. Lần native OCR đầu dùng overlay so bằng width, sai khi màn hình có
cùng kích thước; fixture đã chọn màn hình tại cursor và overlay theo origin, giữ
nguyên assertions OCR và chạy lại thành công.

Đo riêng native OCR fixture: cold 62 MiB, peak 723 MiB, idle sau 2s 438 MiB với
0 renderer (main 186, GPU 204, utility 48 MiB). Đây là một phép đo working set trên
máy Windows hiện tại, có test profile/fixtures và runtime flags của smoke; không
phải benchmark thống kê hoặc hard cap production. Main/GPU vẫn giữ footprint
đáng kể dù worker/renderer đã kết thúc; cần profiling riêng nếu tiếp tục giảm RAM.
Không kết luận footprint đó là leak chỉ từ một sample, cũng không báo “RAM đã tối
ưu hoàn toàn”. Warning CSP trong log OCR đến từ trang fixture `data:`; policy của
renderer sản phẩm không được nới để test pass.

Regression dùng header nhỏ để chứng minh refusal trước decoder; không cố cấp
phát pixel bomb hay gây OOM trên máy user. Không build installer/sign hoặc chạy
macOS/Linux. Không gửi dependency metadata tới audit service.
