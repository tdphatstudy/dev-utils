# Tray, Quick Tools và Clipboard Manager

Bản triển khai ngày 2026-10-08 bổ sung icon theo thao tác trong tray, logo
DevFusion cho cửa sổ phụ, widget mở nhanh và Clipboard Manager ở Text / Dev.
Đóng cửa sổ chính giải phóng renderer; tray và global shortcut vẫn hoạt động
khi DevFusion còn chạy. Quit thoát app và gỡ phím tắt.

## Cách dùng

- Tray → Clipboard Manager hoặc **Ctrl+Shift+Space** trên Windows/Linux,
  **⌘+⇧+Space** trên macOS. Đổi/tắt phím ở Settings → Global quick shortcuts.
  Check OS availability thử đăng ký với OS; Settings cũng kiểm tra trùng với
  các thao tác trong cửa sổ DevFusion. OS không cung cấp tên app đang giữ phím.
- Capture tự bật khi mở app, ghi nhận nội dung clipboard hiện tại nếu hợp lệ và
  các lần copy tiếp theo. Có thể Pause ngay trong widget, hoặc tắt hẳn ở Settings.
  Sau Resume/unlock, app bỏ qua nội dung đang có để tránh thu lại dữ liệu riêng tư;
  **Save current clipboard** trong menu thêm nội dung hiện tại khi người dùng chọn.
- Tìm trong toàn bộ text và nhãn, lọc Text/JSON/URL/Color/Image hoặc chỉ mục ghim.
  Mở bằng global shortcut khi con trỏ đang ở input của ứng dụng đích: nút **Paste**,
  bấm hàng hoặc Enter khôi phục focus về ứng dụng đó, dán tại con trỏ và đóng widget.
  Nút Copy vẫn copy bản gốc; khi không có target hợp lệ, hàng/Enter dùng Copy.
  Mũi tên chọn mục;
  Alt+Enter hoặc nút con mắt mở preview; Ctrl/⌘+Shift+Enter dùng plain text;
  Ctrl/⌘+1…9 dùng mục
  các mục đang hiển thị. **Pin** ở header giữ cửa sổ khi chuyển focus; ghim từng
  mục trong danh sách là thao tác riêng để ưu tiên lưu giữ mục đó.
- Preview có JSON format/minify, Base64 UTF-8, URL encode/decode, trim, sort và
  loại dòng trùng. Bản gốc được giữ. JSON không làm tròn số lớn hoặc mất key trùng.
  Menu ba chấm → Select multiple → chọn các mục text → Merge & copy để ghép
  theo thứ tự chọn. Checkbox và công cụ chỉnh sửa chỉ xuất hiện trong chế độ này
  hoặc preview. Settings dùng dialog; history mặc định là một danh sách dễ quét.
- PNG có preview và OCR chủ động trong widget và cửa sổ chính, dùng engine/model local hiện có.
  **Extract text (OCR)** hiện loading và kết quả bên dưới ảnh; giữ nguyên ảnh gốc,
  có Copy text/Paste text riêng. Renderer chạy engine ẩn và bị hủy khi hoàn tất;
  không mở cửa sổ OCR khác. Kết quả lỗi, rỗng và privacy invalidation hiển thị tại chỗ.
  Copy original formats giữ text/HTML/PNG đã hỗ trợ; HTML không được thực thi
  trong preview. Paste dùng cùng format đã chọn; Copy vẫn cho phép paste thủ công.
- Tất cả chín mục Tray → Open tool mở widget riêng. Color vào eyedropper ngay,
  có kính phóng đại và popup kết quả. UUID có sẵn một giá trị, tạo thêm 1/5/10;
  Timestamp hiện giờ hiện tại và chuyển Unix/ISO khi nhập. JSON/Base64 xem kết quả
  trực tiếp; QR tạo ảnh hoặc đọc file local; OCR chọn ảnh/PDF hoặc vùng màn hình;
  Mock API có cấu hình health mẫu, Start/Stop và trạng thái server loopback.
  Không mở AppShell, không lưu draft và không tự khởi động server.
- Logo thật và glyph Lucide được rasterize thành PNG màu cho menu native;
  giữ viewBox vuông, đường cong và tỉ lệ. Cửa sổ phụ OCR/Color cũng hiển thị logo.
- Escape, Close hoặc chuyển focus đóng widget, trừ khi đã Pin cửa sổ. App tạo
  tối đa một quick widget; đổi loại widget hủy cửa sổ cũ.

## Nghiên cứu và lựa chọn sản phẩm

Đối chiếu tài liệu sản phẩm chính thức ngày 2026-10-08. Mục tiêu là giảm bước
trong công việc developer và cho người dùng kiểm soát việc ghi nhận dữ liệu;
không khẳng định vượt mọi clipboard app ở mọi tính năng.

| Sản phẩm / nguồn | Khả năng đáng học hỏi | Lựa chọn đã triển khai trong DevFusion |
|---|---|---|
| [Raycast Clipboard History](https://manual.raycast.com/clipboard-history) | Tìm/lọc nhiều loại nội dung, ghim/nhãn, OCR, exclusion, thời hạn lưu, paste nhiều mục | Search toàn text, lọc/ghim/nhãn, merge có thứ tự, OCR local chủ động; preview/chuyển đổi phục vụ developer |
| [CopyQ](https://hluk.github.io/CopyQ/) | Rich/custom formats, tags/tabs, shortcut cấu hình, scripting và paste vào app đích | Widget chuyên biệt và shortcut cấu hình; giới hạn format rõ ràng, bridge có thao tác cố định |
| [PowerToys Advanced Paste](https://learn.microsoft.com/en-us/windows/powertoys/advanced-paste) | Chuyển text/JSON/Markdown local, OCR, history; AI là khả năng tùy chọn | Các phép chuyển đổi offline, JSON giữ nguyên số/key, nhiều mục text ghép được; không thêm yêu cầu AI/account |

Điểm trọng tâm là luồng **global shortcut → tìm → Paste vào ứng dụng trước đó**;
preview/biến đổi là lựa chọn bổ sung. Các widget dùng chung tray/brand/toolbox nhưng tải độc
lập; dữ liệu clipboard không đi vào session history/drafts chung. Tự che lịch sử
và dừng capture khi Box đang mở hoặc màn hình khóa giúp tránh tự ghi lại nội dung
kho riêng tư qua clipboard. Đây là biện pháp giảm rủi ro, không phải bảo đảm nhận
biết mọi bí mật trong text/ảnh hoặc biết nguồn app đã copy.

## Lưu trữ, quyền riêng tư và giới hạn

- Mặc định capture **On**, history **RAM**, tối đa 200 mục, giữ một ngày.
  Preferences v1 áp dụng mặc định tự capture theo yêu cầu mới; Save settings ghi
  v2 để nhớ lựa chọn tắt của người dùng. Không đổi format history mã hóa v1.
  Có thể chọn 20–300 mục và 1/7/30 ngày; ghim tối đa 20 mục. Mục ghim cũng hết hạn.
  Text và HTML mỗi loại ≤256 KiB, PNG ≤4 MiB và ≤16 triệu pixel. Tổng serialized
  content giữ lại ≤24 MiB, tính cả Base64/JSON escaping; tổng RAM của Electron lớn hơn.
- Chỉ preferences và binding metadata được lưu thông thường. Khi bật
  **Keep encrypted history after restart**, nội dung vào `clipboard-history.enc`
  bằng [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
  Windows dùng bảo vệ OS gắn với tài khoản, không bảo vệ khỏi tiến trình độc hại
  chạy cùng tài khoản. macOS có thể cần quyền Keychain. Linux từ chối backend
  `basic_text`/không xác định; không có fallback lưu history plaintext.
- History corrupt/không đọc được được giữ nguyên và báo lỗi. Muốn thay thế phải
  tắt encrypted storage hoặc Clear history chủ động. Clear có xác nhận, xóa cả
  mục ghim và file history của tính năng này; không thay đổi clipboard OS hoặc
  các file vault. Tắt persistence xóa file encrypted của tính năng, vẫn giữ RAM.
- Reader kiểm tra native confidentiality marker và Windows
  [clipboard-history opt-out](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats).
  Text giống private key/token/credential/password và exclusion phrase được bỏ qua
  theo heuristic. Không thể bảo đảm nhận ra mọi secret; ảnh không tự được OCR để
  dò secret. Nên Pause trước khi copy nội dung nhạy cảm.
  Exclusion phrase là keyword cấu hình plaintext: không nhập mật khẩu/token/key
  thật vào ô này; main từ chối các secret nhận biết được trước khi ghi metadata.
- Capture polling 500 ms có thể bỏ lỡ các thay đổi rất nhanh. Copies là số lần
  quan sát lại nội dung sau thay đổi, không phải bộ đếm mọi thao tác Copy của OS.
  Timeout đọc năm giây tạm dừng capture để người dùng Resume và thử lại.
  Chỉ một item text/HTML/PNG; không nhập file list, multi-item hoặc custom format.
- Paste chỉ chạy sau thao tác chủ động trong widget, với target do main ghi nhận
  trước khi widget chiếm focus. Windows kiểm tra HWND/PID, foreground và modifier
  keys rồi dùng Ctrl+V qua SendInput; không đưa clipboard content vào command line.
  HWND/PID chỉ giữ trong RAM đến khi widget đóng. Không tự chọn input khác hay
  di chuyển con trỏ trong tài liệu. Target đóng, OS chặn focus/permission hoặc
  app elevated sẽ báo lỗi, giữ widget và nội dung đã copy để paste thủ công.
  macOS dùng System Events và cần quyền Accessibility/Automation; X11 cần
  `xdotool` đã có trên máy. Wayland không hỗ trợ direct paste trong adapter này.
  Không tự cài dependency, xin elevation hoặc thay đổi quyền hệ thống.
- Không có sync thiết bị, remote link preview, script
  tùy ý, AI, source-app exclusion hay auto-start trong bản này. OS shortcut chỉ
  hoạt động khi app đang chạy. Wayland có thể cần portal/consent; cần QA native.
  [globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)
  có thể bị OS từ chối; Check là kết quả tại thời điểm kiểm tra, không phải cam kết.
- Renderer/helper sandbox vẫn bật. Clipboard IO ở main dùng
  [API async của Electron 44](https://www.electronjs.org/docs/latest/api/clipboard),
  payload bounded, guard chính xác sender/frame/URL. Event chỉ báo thay đổi;
  dữ liệu không được broadcast đến cửa sổ khác hoặc gửi ra mạng.
  Guard [webRequest](https://www.electronjs.org/docs/latest/api/web-request)
  chặn cả HTTP/WebSocket và file ngoài renderer resources của widget.

Theme Light/Dark/System được main lưu trong `theme.json` (chỉ preference metadata),
seed từ theme localStorage hiện có khi main renderer kết nối lần đầu. Main áp dụng
`nativeTheme.themeSource` để native UI, quick window và Color/OCR helpers dùng
cùng mode, kể cả khi cửa sổ chính đã đóng. Widget đang mở nhận event đổi theme.

## Kiểm chứng

Test unit tập trung kiểm tra auto-capture và explicit-disable v2, privacy baseline,
secrets/native opt-out, dedup,
expiration/bounds, ciphertext/restore corrupt, invalidation sau Clear/privacy,
timeout reader, sender/helper lifecycle, OS-registration rollback và tray icons.
`tests/quick-tools-ui.smoke.mjs` chạy production renderer với named API fixture:
JSON lossless, search/filter/merge, confirmation, privacy masking, widgets,
global/app collision, 420/620/760 px light/dark và English/Vietnamese/Arabic.
Nó kiểm tra widget không tải main entry/editor/SQL/OCR engine và không gửi request remote.

`tests/electron-quick-tools.smoke.mjs` dùng profile tạm, IO clipboard fixture và
Electron thật: file URL, preload sandbox, OS hotkey registration khi mọi cửa sổ
đã đóng, native icon resource, encrypted history bằng OS và cleanup. Không sửa
clipboard thật, không đọc vault/màn hình thật, không mô phỏng nhấn hotkey vật lý.
macOS/Linux chưa được smoke native trên máy Windows hiện tại. Installer chưa
được đóng gói/phát hành trong phạm vi thay đổi này. Một số nhãn chuyên sâu và
lỗi backend tiếp tục có English fallback theo cơ chế i18n hiện có.

Chạy `pnpm typecheck`, `pnpm build`, `pnpm test --maxWorkers=1 --testTimeout=20000`,
quick-tools UI và Electron native fixture để kiểm chứng bản thay đổi. Báo cáo cuối
ghi kết quả thực tế. Build giữ cảnh báo vendor SQL lớn đã có từ trước; không thêm
dependency, đổi lockfile hoặc đưa engine đó vào widget.

Lượt kiểm chứng cuối ngày 2026-10-08: **116 file / 1.068 test** qua; typecheck,
build, quick-tools UI và Electron quick/color/OCR fixtures đều qua trên Windows.
UI QR decode đọc ảnh khác input hiện tại, xác nhận blob ảnh local được CSP cho phép
đúng phạm vi. OCR fixture chạy model English/Vietnamese và PDF offline, kiểm tra
logo popup và không còn renderer sau khi đóng. Hotkey kiểm tra đăng ký OS và
lifecycle; chưa mô phỏng nhấn phím vật lý hoặc chạy native macOS/Linux.

Lượt sửa UX ngày 2026-10-09: **124 files / 1.105 tests** qua; typecheck, production
build, quick-tools UI và Electron quick fixture qua. UI kiểm tra Paste/keyboard,
đồng bộ theme khi widget còn mở và từ titlebar chính, OCR inline ở cả hai cửa sổ,
loading/error/empty/privacy states và tự cuộn kết quả vào viewport. Model Anh/Việt
thật chạy thành công trong runner ẩn (`electron-ocr.smoke.mjs --inline-only`),
không chụp màn hình hoặc đọc clipboard thật. Build còn warning vendor SQL cũ.

`electron-clipboard-paste.smoke.mjs` dùng input Windows riêng, intercept WM_PASTE
để không đọc/thay clipboard thật. Nó từ chối click nếu không xác minh đúng HWND
đang chiếm vị trí màn hình; lần chạy này **SKIP** vì fixture bị che trong desktop
chạy nền. Vì vậy native focus/Ctrl+V/Word chưa được xác nhận qua kiểm thử này.
macOS/X11/Wayland và installer chưa được kiểm chứng trong lượt sửa UX này.
Windows foreground/input behavior dựa trên
[SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow),
[SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)
và [AttachThreadInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-attachthreadinput).
