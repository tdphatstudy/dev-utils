# Phím tắt DevFusion

Vào **Settings → Keyboard shortcuts** để tìm thao tác theo tên, tool, phạm vi
hoặc tổ hợp phím. Danh mục có thao tác của app, mở mọi tool trong registry và
các thao tác trong editor/HTTP, Private Box, OCR và Color Picker.

## Đổi và kiểm tra

- Chọn nút bút chì ở thao tác. Nhấn tổ hợp trong ô ghi phím hoặc nhập trực tiếp,
  ví dụ `Mod+Alt+8`. `Mod` là Ctrl trên Windows/Linux, Command trên macOS.
- UI hiển thị thao tác đang giữ tổ hợp đó và phạm vi của nó. Không lưu tổ hợp
  trùng trong phạm vi chồng nhau hoặc phím thường dành cho OS/menu/soạn thảo.
- **Check a shortcut** kiểm tra mà không thay đổi cấu hình. Có thể tìm bằng
  nhãn tổ hợp đang hiển thị, và dùng **Conflicts only** để xem cấu hình lỗi.
- Có thể tắt hoặc reset riêng từng thao tác. Reset riêng bị từ chối nếu phím
  mặc định đang được thao tác khác giữ. Reset tất cả cần xác nhận.
- Thay đổi có hiệu lực ngay; nhãn trong palette, editor và menu Box cập nhật.
  Tắt phím không tắt nút hoặc thao tác bằng chuột.

Phím chỉ hoạt động trong cửa sổ DevFusion đang được chọn. Một tổ hợp có thể dùng
cho OCR và Color Picker vì hai màn hình không hoạt động đồng thời. Phím toàn app
chồng phạm vi với mọi tool. Editor và Box chồng phạm vi vì editor nằm trong Box.
Dialog/menu đang mở, lúc ghi phím, khóa UI, IME/AltGr và key repeat đều có guard.
Context menu chỉ chuyển sang palette bằng phím palette được cấu hình; các phím
điều hướng menu, Escape/Tab và thao tác soạn thảo chuẩn vẫn do control quản lý.

Không đăng ký phím toàn hệ điều hành. Bộ kiểm tra nhận biết các binding trong app
và danh sách phím phổ biến dành riêng; không thể liệt kê hoặc cam kết phát hiện
mọi phím của ứng dụng khác, driver, layout hoặc OS do người dùng tự đặt.

## Mặc định

| Thao tác | Windows/Linux | macOS |
|---|---|---|
| Command palette | Ctrl+K | ⌘+K |
| Settings | Ctrl+, | ⌘+, |
| Home / sidebar / theme | Ctrl+Shift+H / B / L | ⌘+⇧+H / B / L |
| Khóa Box qua luồng recovery hiện có | Ctrl+Shift+X | ⌘+⇧+X |
| JSON / HTTP / Keep / OCR / Color Picker | Ctrl+Shift+1…5 | ⌘+⇧+1…5 |
| Chạy trong editor hỗ trợ / gửi HTTP / so sánh env | Ctrl+Enter | ⌘+Enter |
| Lưu tài liệu Box | Ctrl+S | ⌘+S |
| Tạo text / JSON / folder trong Box | Ctrl+N / Ctrl+J / Ctrl+Shift+N | ⌘+N / ⌘+J / ⌘+⇧+N |
| Đổi tên / mở mục Box được chọn | F2 / Enter | F2 / Enter |
| Xóa mục Box được chọn, có xác nhận | Delete | ⌘+Backspace |
| Lấy màu trong Color Picker | Ctrl+Shift+C | ⌘+⇧+C |
| Chụp vùng chữ trong OCR | Ctrl+Shift+A | ⌘+⇧+A |

Các tool khác và OCR toàn màn hình chưa gán mặc định; có thể gán trong Settings.
`editor.run` chỉ gọi handler mà tool đã cung cấp; không chạy mọi nút trong mọi
tool. Luồng xác nhận xóa, chặn navigation khi có edit chưa lưu và validate input
HTTP/crypto được giữ nguyên.

## Kiến trúc và quyền riêng tư

`src/shared/shortcuts` chứa contract, parser và logic thuần. Renderer catalogue
đọc metadata registry, không gọi lazy loader. Hook app chạy điều hướng qua router;
hook tool chỉ có hiệu lực khi component đang mount và sẵn sàng. Binding hợp lệ
về cú pháp nhưng bị trùng/dành riêng từ localStorage được báo và không thực thi.
Field có ID/cú pháp sai bị loại lúc hydrate; binding mặc định được giữ.

Chỉ `shortcutOverrides: { commandId: combination | null }` lưu trong preferences
`devutils-app`. Không lưu chuỗi gõ, screen capture, clipboard hoặc input tool vào
cấu hình phím. Dữ liệu legacy không cần migration. IPC mới `security:lock` kiểm
tra trusted sender và gọi `VaultAutoLock.lock('manual')`, zero key buffers và
giữ đường đi encrypted draft recovery; không expose command/channel tùy ý.

## Nghiên cứu

- [Electron keyboard shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts):
  phân biệt local với global, cho phép keydown trong cửa sổ.
- [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut):
  đăng ký global có thể thất bại nếu tổ hợp bị chiếm; `isRegistered` chỉ kiểm tra
  binding của chính app. Đây không phải API liệt kê phím của các ứng dụng khác.
- [VS Code keybindings](https://code.visualstudio.com/docs/configure/keybindings):
  phạm vi/điều kiện, ghi phím, tìm tổ hợp và xem binding trùng. DevFusion áp dụng
  các ý tưởng này với phạm vi cố định phù hợp tool hiện có.

## Kiểm chứng

`pnpm test src/shared/shortcuts/index.test.ts tests/app-preferences.test.ts
src/main/vault-auto-lock.test.ts tests/i18n.test.ts` kiểm tra parser, alias, giới
hạn metadata, Ctrl/Command, key repeat/IME/AltGr, context overlap, reserved keys,
hydration và trusted manual lock/recovery. Test UI production:
`node tests/shortcuts-ui.smoke.mjs` sau `pnpm build`; dùng named desktop API giả
lập, không đụng dữ liệu người dùng, màn hình thật hay đích network bên ngoài.
`node tests/privatebox-menu-ui.smoke.mjs` kiểm tra focus và dialog/menu isolation.

macOS/Linux chỉ có kiểm tra logic bằng fixture trên máy Windows hiện tại; cần
native smoke trên từng OS trước khi khẳng định tương tác với OS/menu của chúng.

Khi chạy review, toàn bộ 109 file / 1.035 test đã qua với
`pnpm test --maxWorkers=1 --testTimeout=20000`. Các lượt chạy nhiều worker cùng
build bị timeout ở test KDF/OS; không thay đổi assertion hoặc timeout trong mã
test để bỏ qua chúng. UI shortcuts, navigation, Box menu/custom bindings và
vault lock/recovery đã qua trên production renderer với fixture riêng.

Kiểm tra crypto phát hiện pane HMAC bị cắt ở logical viewport 360×250. Minimum
pane chỉ được giảm khi chiều cao viewport ≤300 px để editor vẫn đủ 64 px và có
thể cuộn tới toàn bộ khung. Test geometry đợi callback trả focus/cập nhật viewport
và đo khung editor thay vì toàn bộ tài liệu CodeMirror có scroll nội bộ.

Trạng thái cuối: `pnpm typecheck`, `pnpm build`, shortcuts UI, navigation UI,
Box menu/custom bindings, vault lock/recovery và crypto UI đều qua. Crypto UI
bao gồm light/dark ở 720/900/1200×500 và logical viewport 360×250. SQL vendor
chunk vẫn có cảnh báo kích thước từ build; không đổi dependency/chunking trong
phạm vi sửa phím tắt.
