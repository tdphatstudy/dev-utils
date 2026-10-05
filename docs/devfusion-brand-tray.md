# DevFusion: review UI, brand và tray — 2026-10-05

Picker đã được sửa sau báo lỗi lấy màu chỉ trong cửa sổ. Luồng hiện tại và native
regression nằm trong [desktop picker fix](color-picker-desktop-fix.md). Các số đo
RAM phía dưới là fixture tray của đợt branding, không đo peak RAM lúc capture.

## Kết quả review và thay đổi

| Điểm cần cải thiện | Triển khai |
| --- | --- |
| Tên/nhận diện chưa thống nhất giữa UI, mẫu dữ liệu và installer | DevFusion trong Home, About, tiêu đề cửa sổ, menu, package, shortcut, installer và các sample mặc định |
| Logo bitmap lớn và thiếu bộ icon tray riêng | SVG master với các module chồng nhau, chữ F, xanh/indigo và điểm nhấn cyan; export PNG/ICO/favicon; SVG cho UI và About |
| Cần vào toolbox đầy đủ để dùng các thao tác nhanh | Tray native: chọn màu desktop → popup HEX/RGB/HSL/HSV với Copy/Repick, copy UUID, copy màu cuối, mở tool và Quit |
| Giữ cửa sổ ẩn sẽ giữ renderer, editor và draft trong RAM | Đóng cửa sổ thật; chỉ tạo lại một cửa sổ khi cần. Minimize vẫn giữ phiên làm việc |
| Chưa có Color Picker chung giữa tray và app | Tool lazy `design.color` trong nhóm Design, Home, sidebar, tìm kiếm và tray; HEX/RGB/HSL, copy CSS, preview tương phản, tối đa 12 màu gần đây trong RAM |

Home giữ ngôn ngữ UI macOS hiện có, thêm tagline và Quick access. Settings giải
thích Close/Minimize/Quit, trạng thái tray và nút Quit. Mở lại app giữ tool đang
dùng; chỉ chọn một tool cụ thể trong tray mới yêu cầu router điều hướng. Điều
hướng này đi qua cảnh báo draft của Keep. Đóng/Quit có cảnh báo native khi view
có thay đổi chưa lưu hoặc đang lưu; người dùng có thể tiếp tục chỉnh sửa.

## Cấu trúc và tương thích

- `src/shared/brand.ts`: tên sản phẩm, tagline và installation ID.
- `src/main/branding.ts`: giữ userData/sessionData ở folder DevUtils/devutils cũ;
  chọn resource cho development và packaged app.
- `src/shared/quick-actions.ts`: danh sách tool ổn định và route allowlist.
- `src/main/tray.ts`: native menu, một main window và thao tác UUID trực tiếp.
- `src/main/color-picker.ts`: chọn màu tạm thời, thời hạn và lifecycle cleanup.
- `src/shared/color`: validation, conversion, luminance và text contrast.
- `src/renderer/src/features/tools/design/ColorPicker.tsx`: tool UI lazy.
- `scripts/export-brand.mjs`, `scripts/fix-icons.py`: export từ SVG trong repo;
  không cần asset riêng ngoài repo. Playwright/Pillow dùng cho export, không thêm
  dependency vào runtime sản phẩm.

`com.devutils.app`, `window.devutils`, storage keys, crypto domains, `.privatebox`
và format vault được giữ nguyên. Không migrate vault, đổi salt hay tạo khóa thay
thế khi đổi tên. Với cả hai folder cũ tồn tại, development ưu tiên `devutils`,
packaged app ưu tiên `DevUtils`, tương ứng tên mặc định trước đổi brand. Đường
dẫn Chromium được đặt trước `ready` theo [Electron app API](https://www.electronjs.org/docs/latest/api/app).

Icon macOS dùng template 16/32 px với alpha cutout thật và DPI 72/144; Windows
dùng ICO nhiều kích thước, Linux dùng PNG. Khi trạng thái picker/màu cuối đổi,
menu được build lại và đặt lại để đáp ứng hành vi của tray Linux theo
[Electron Tray API](https://www.electronjs.org/docs/latest/api/tray).

## RAM và lifecycle

Tray không tạo main renderer. UUID chạy bằng `crypto.randomUUID` trong main;
không mở tool hay đọc clipboard. Screen Picker chỉ tạo một helper tạm, hủy sau
chọn/hủy, hết hai phút, owner bị đóng hoặc Quit. Không có screen polling, đọc
clipboard nền, auto-start, background uploads hay telemetry.

Số đo **lần chạy fixture native cuối trên Windows, Electron 44.5.1** bằng
`app.getAppMetrics()`; cửa sổ tải production renderer Color Picker. Đây là
fixture profile tạm, không phải benchmark đầy đủ của mọi tool/vault/installer.

| Trạng thái | Tổng working sets (MiB) | Tổng private bytes (MiB) | Renderer Tab |
| --- | ---: | ---: | ---: |
| Cold, trước tạo tray | 64 | 59 | 0 |
| Cold, có tray, chưa mở cửa sổ | 68 | 59 | 0 |
| Mở Color Picker | 377 | 238 | 1 |
| Sau đóng cửa sổ 2 giây, còn tray | 286 | 197 | 0 |

Tray thêm khoảng 2–4 MiB working set giữa các lần đo cold này. Đây là snapshot
ngay khi tạo tray, chưa phải số đo idle lâu dài. Đóng cửa sổ giải phóng
renderer, nhưng các process GPU/service và cache đã khởi động vẫn giữ bộ nhớ.
Tổng working sets có thể đếm lại trang chia sẻ; private bytes đo vùng riêng đã
commit, không phải chỉ RAM resident. Số liệu phụ thuộc máy, OS, GPU và tool đã
dùng. Không diễn giải phần tăng này là RAM của toàn app hoặc cam kết tray luôn
chỉ dùng 68 MiB sau khi đã mở tool. Chọn **Quit DevFusion** để thoát hoàn toàn.

Đóng main window cũng xóa RAM drafts/history và khóa vault qua lifecycle guard
đã có. Không hide cửa sổ để giữ dữ liệu decrypted ở nền. Nếu native tray không
tạo được, đóng cửa sổ cuối thoát bình thường trên Windows/Linux; macOS vẫn theo
lifecycle Dock. Không nới sandbox, webSecurity hay site isolation để giảm RAM.

## Quyền và xử lý lỗi

Picker hiện dùng desktopCapturer chụp OS trước khi mở overlay, không dùng
EyeDropper trong cửa sổ nhỏ. Snapshot chỉ trong RAM; overlay từng màn hình bị
hủy sau chọn/hủy. Popup kết quả có bốn hệ màu, Copy chủ động và Repick. Helper
có preload riêng tối thiểu, không có bridge toolbox/Node; giữ sandbox,
contextIsolation, webSecurity, partition không persistent, local-only CSP và
chặn navigation/redirect/popup. Main kiểm tra helper/frame/URL/mode và format.
Xem [desktop picker fix](color-picker-desktop-fix.md) và
[Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer).

`color:pickScreen`, `color:lastScreen`, `app:trayAvailable`, `app:quit` kiểm tra
sender main frame/URL của app bằng trust guard hiện có. Preload chỉ có named
methods/events; route và HEX events được validate. Mỗi lần chỉ một picker;
owner bị hủy không được copy kết quả trễ. Esc/lỗi không thay đổi màu đang nhập.
Clipboard thất bại có thông báo và cách copy lại. OS không hỗ trợ thì dùng nhập
màu thủ công, không giả lập thành công.

`design.color` nằm trong `NO_HISTORY_TOOLS`: không ghi generic drafts/history.
Recent colors thuộc component RAM, mất khi rời view. Tray giữ duy nhất màu màn
hình vừa chọn trong RAM đến Quit. Không thay đổi chính sách lưu encrypted vault.

## Verification và giới hạn

- `pnpm test --maxWorkers=1 --fileParallelism=false`: 503 tests / 75 files pass.
- 13 focused tests cho branding, tray, color service/conversion và route allowlist
  pass; đã chạy lại sau sửa hành vi mở lại cửa sổ.
- `pnpm typecheck`: pass. Production build tách Color Picker thành lazy chunk
  khoảng 6,8 kB và bỏ PNG logo lớn khỏi startup; vendor SQL vẫn có cảnh báo chunk
  khoảng 2,9 MB từ trước.
- `pnpm build`, `git diff --check` và kiểm tra local links/resource paths: pass.
- `tests/renderer-ux.smoke.mjs`: production renderer với Edge headless và bridge
  fixture RAM; kiểm tra Home/brand, tray route giữ draft, Color Picker conversion,
  validation, pick/cancel/error, tray event, clipboard failure/retry; cùng các
  regression Keep, YAML worker, keyboard/focus và dialog 720×600. Color Picker
  cũng pass kiểm tra bounds/không có horizontal overflow ở light theme 720×600;
  đã xem screenshot Home/dark và Color Picker/dark/light.
- `tests/electron-tray.smoke.mjs`: tray native Windows, giữ dữ liệu legacy fixture,
  idle không có window, reuse/reopen một cửa sổ, renderer bị giải phóng, secure
  helper và tray được hủy. Fixture tray không chọn pixel thật, đọc clipboard hay
  mở vault thật; fixture desktop picker riêng đã chọn pixel của cửa sổ OS khác.
- `tests/electron-security.smoke.mjs`: production preload/file-URL YAML worker,
  stale vault token, navigation guard và native key cleanup trong profile tạm.

Đã xác nhận chọn pixel OS thật trên Windows trong fixture riêng. Permission dialog,
macOS/Linux tray,
installer upgrade/shortcut và signed packages. Build không thay thế các kiểm tra
đó. Branding giữ installation ID và dữ liệu cũ nhưng vẫn cần thử upgrade installer
trên từng OS. Electron RAM nền còn đáng kể sau khi dùng tool; cần profiling các
phiên thực tế trước khi đưa ra mục tiêu RAM sản phẩm cụ thể.
