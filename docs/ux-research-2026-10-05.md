# DevFusion — nghiên cứu UX và đánh giá sâu, 2026-10-05

## Kết luận và giới hạn của bằng chứng

Bản render sweep trước đây chứng minh một tập màn hình có thể render, không
chứng minh ứng dụng dễ dùng, đẹp nhất hoặc không có bug. Ảnh người dùng gửi cho
thấy lỗi focus ở command palette mà tập kiểm tra trước đã bỏ sót. Đợt này dùng
tài liệu gốc, kiểm tra source và tình huống thực tế để tìm nguyên nhân và đặt
tiêu chí sửa. Điểm xuất phát là commit `5810285`; bảng bên dưới ghi **vấn đề trước
khi sửa**, không tự coi mọi đề xuất là đã hoàn thành.

Đây là expert review có hỗ trợ kiểm tra tự động, chưa phải nghiên cứu với người
dùng đại diện. Các agent cũng không tương đương một nhóm evaluator con người
độc lập. Không có số đo SUS, tỷ lệ hoàn thành tác vụ hay mức hài lòng của người
dùng thật. NN/g phân biệt expert review với usability testing: nhận định của
chuyên gia giúp phát hiện vấn đề, còn ảnh hưởng thực tế cần quan sát người dùng.
[NN/g: UX Expert Reviews](https://www.nngroup.com/articles/ux-expert-reviews/)

## Cơ sở nghiên cứu và quyết định áp dụng

| Nguồn gốc | Điều rút ra | Quyết định cho DevFusion |
|---|---|---|
| [NN/g — 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) | Phản hồi trạng thái, kiểm soát thao tác, tính nhất quán, khả năng sửa lỗi và nhận biết thay vì ghi nhớ. | Đánh giá cả tìm tool → nhập → kết quả → sửa lỗi → quay lại; không chỉ màu và layout. |
| [NN/g — Response Times, 1993; phần bổ sung 2014](https://www.nngroup.com/articles/response-times-3-important-limits/) | Khoảng 0.1 s, 1 s và 10 s là các mốc kinh nghiệm cho phản hồi, mạch suy nghĩ và sự chú ý; không phải SLA của sản phẩm. | Đo tải lần đầu và mở lại riêng. Sau click phải thấy tool được chọn; chờ lâu phải có trạng thái và đường rời màn hình. Không thêm thời gian chờ cố định. |
| [NN/g — Progress Indicators, 2014](https://www.nngroup.com/articles/progress-indicators/) | Feedback động có thể giảm bất định; spinner thoáng qua cũng có thể gây phân tâm. Tiến độ vô hạn không giải thích được tác vụ bị treo. | Hoạt ảnh nhỏ có thể xuất hiện khi việc chuẩn bị kéo dài; kết quả sẵn sàng thì hiển thị ngay. Trạng thái chờ lâu cần hướng phục hồi. Không suy ra mascot chắc chắn tăng hài lòng trong app này. |
| [Apple HIG — Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators) | Chỉ dùng determinate khi biết tiến độ; báo tiến độ chính xác, đặt nhất quán và cho hủy khi phù hợp. | Dynamic import chưa cung cấp tổng tiến độ tin cậy: dùng trạng thái indeterminate, không dựng phần trăm giả. OCR/file hash dùng tiến độ thật của tác vụ. |
| [Apple HIG — Loading](https://developer.apple.com/design/human-interface-guidelines/loading) | Tránh tải làm gián đoạn trải nghiệm; nội dung chờ có thể hữu ích khi chờ dài. | Logo hoạt ảnh liên quan thương hiệu, kèm tên tool và hướng rời màn hình; không thêm game, video hoặc model chỉ để trang trí. |
| [Microsoft — Progress controls](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/progress-controls) | Tiến độ biết trước khác với chờ chưa biết; hoạt động không modal nên để người dùng tiếp tục thao tác khác. | Chỉ vùng tool đang chờ; sidebar và điều hướng vẫn dùng được. Loading không khóa toàn ứng dụng. |
| [W3C — Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Keyboard focus cần nhìn thấy; tiêu chí AA về obscured không đồng nghĩa mọi viền focus cắt một phần đều là vi phạm. | Sửa focus square bị cắt trong palette bằng một search field có biên và focus thống nhất. Kiểm tra bằng keyboard và ảnh, không bỏ focus toàn app. |
| [W3C — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | SC 2.3.3 ở mức AAA; chuyển động không thiết yếu cần có cách tắt. | Tôn trọng `prefers-reduced-motion`, giữ logo tĩnh và thông tin trạng thái. Không lấy tiêu chí AAA để tuyên bố lỗi AA. |
| [W3C — Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), [ARIA 1.2 aria-busy](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) | Trạng thái cần được assistive technology nhận biết. `aria-busy=true` có thể khiến AT hoãn thông báo trong vùng đó. | Live status nằm ngoài vùng busy; không báo “opened/ready” trước khi tool mount. Kiểm tra trạng thái chờ, thành công, lỗi riêng. |
| [W3C APG — Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [Menu](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) | Dialog giữ focus và trả focus; menu có focus ban đầu, arrow navigation và Escape quay về context. | Palette/dialog/menu phải dùng được bằng bàn phím, đóng đúng layer và không kích hoạt shortcut ở phía sau. |

Apple HIG được đọc từ kết quả index chính thức; endpoint mở trực tiếp yêu cầu
JavaScript. Các nguồn NN/g cũ được dùng như nguyên tắc nền tảng, không như báo
cáo mới đo hành vi developer năm 2026. WCAG Understanding/APG là tài liệu giải
thích và hướng dẫn; bảng trên không phải chứng nhận WCAG của Electron app.

## Phát hiện ưu tiên

P1 = có thể chặn tác vụ, gây thao tác sai hoặc phục hồi thất bại; P2 = ma sát lặp
lại/khả năng tiếp cận; P3 = hoàn thiện sau khi xử lý điểm chặn. Đây là mức ưu tiên
của review, không phải điểm số người dùng. Cân nhắc tần suất, tác động và sự lặp
lại theo [NN/g Severity Ratings](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/).

| ID / ưu tiên | Bằng chứng và ảnh hưởng | Tiêu chí chấp nhận |
|---|---|---|
| R1 / P2 — Focus palette không khớp thiết kế | Ảnh người dùng: viền xanh vuông ôm input lớn, bị cắt ở đầu. `CommandPalette.tsx` dùng input `outline-none`, trong khi rule `:focus-visible` toàn cục đặt outer outline; dialog `overflow-hidden`. Keyboard vẫn thấy focus nên không tự gọi đây là lỗi WCAG toàn phần. | Một search field có focus trọn vẹn, bo góc nhất quán; input không có thêm viền browser lồng bên trong. Tab vẫn phân biệt nút Close. Hai theme, 720×500, zoom 125/150/200%, reduced motion. |
| R2 / P1 — Retry có thể lặp lại lỗi tải tool | `ErrorBoundary.tsx` chỉ xóa state lỗi. Registry dùng `React.lazy`; React cache promise và load result. Nếu promise tải chunk reject, xóa boundary không làm nó tải lại. [React lazy](https://react.dev/reference/react/lazy) | Inject một lần lỗi tải trong fixture: hành động retry phải phục hồi thật hoặc chỉ rõ đường phục hồi khả dụng. Không tự reload mất workspace. Lỗi render thông thường vẫn có retry và Home. |
| R3 / P2 — Feedback tải chưa rõ | Tool chỉ có spinner nhỏ + “Loading…”. Palette lần đầu dùng `Suspense fallback={null}`; click/Ctrl+K có thể trông như không nhận thao tác. Chưa có proof mọi tool mất vài giây. | Tool được chọn thấy ngay; loader brand nhỏ, status có tên tool, không đợi đủ animation mới cho dùng. Palette có feedback khi tải đầu. Điều hướng dùng được; không prefetch mọi tool hoặc OCR model ở idle. |
| R4 / P2 — Trạng thái accessible không khớp readiness | `AppShell.tsx` thông báo tool “opened” khi URL đổi, trước Suspense resolve. `LoadingState` đặt busy trên chính live status và chỉ unmount, chưa có transition false. Rủi ro source-backed; chưa đo NVDA/VoiceOver. | “Preparing/Loading” khi chờ, “ready” chỉ sau mount; live status không bị busy ancestor hoãn. Không đọc từng animation frame. Cần kiểm tra screen reader thật trước khi tuyên bố native accessibility. |
| R5 / P1 — Menu vault và shortcut phía sau | `ContextMenu.tsx` chỉ xử lý Escape; không đưa focus vào menu/arrow navigation/focus return. `DesktopDesktop.tsx` global Enter/Delete/F2 không guard menu đang mở. | Menu nhận focus, Arrow/Home/End hoạt động, Escape chỉ đóng menu và trả focus. Enter chọn đúng item; Delete/F2 không chạy tác vụ phía sau menu/dialog/palette. Xác minh bằng vault fixture, giữ nguyên trust boundary/session guard. |
| R6 / P2 — Menu có thể cắt ngoài viewport | Context menu clamp theo kích thước cố định 220×280, không đo chiều cao thật, không min 0 hay scroll. Item menu có thể cao hơn dự đoán. | Đo rect menu sau mount; clamp cả bốn cạnh với khoảng đệm. Khi menu dài hơn viewport có scroll và mọi item tới được bằng keyboard. Kiểm tra 720×500 và zoom 200%. |
| R7 / P2 — Workspace mất ý nghĩa khi quay lại | Base64 lưu input draft nhưng mode/variant reset khi remount; sau Reverse và quay lại, encoded input có thể được coi là Encode. Regex lưu pattern/text nhưng flags, mode và replacement reset. Source cho thấy state tách rời; cần reproduction fixture. | Nếu giữ workspace thì giữ mode/options cùng input trong RAM cho tool được phép, có giới hạn và clear tại Settings; hoặc nói rõ reset. Không lưu thêm payload security/vault vào drafts/localStorage. Quay lại cho cùng kết quả và ý nghĩa thao tác. |
| R8 / P2 — Layout custom bỏ qua chiều rộng workspace | Shared SplitPane đã dùng container query nhưng Regex, AES/HMAC còn `md:grid-cols-2` theo viewport. Sidebar lấy một phần chiều rộng, làm pane nhỏ dù cửa sổ qua breakpoint. | Quyết định chia pane theo không gian tool thực nhận. Tại 800–1000 px với sidebar mở vẫn nhập/đọc dữ liệu được, không có pane bị ép nhỏ chỉ vì viewport breakpoint. |
| R9 / P2 — Keep chưa theo theme/độ tương phản thống nhất | Keep có nền tối và nhiều `text-white/35`, `/40`, `/50` cùng placeholder trong theme light. Previous token test chỉ chứng minh token shared, không kiểm chứng chữ viết trực tiếp này. | Dùng semantic tokens trong Keep/composer; đo computed foreground/background thực tế của empty, search, labels và editor cả hai theme. [WCAG Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) nêu 4.5:1 cho chữ thường, 3:1 cho chữ lớn với các ngoại lệ cụ thể. |
| R10 / P2 — Delete chưa có trải nghiệm thống nhất | Keep dùng `window.confirm` không nêu tên note. Bản review trước đã ghi điều này; không phải phát hiện mới. | In-app named dialog thể hiện note/tài liệu và hậu quả; Cancel mặc định, focus đúng, busy ngăn thao tác lặp, lỗi giữ dữ liệu. Không thêm Undo vault nếu chưa có recovery/storage design. |
| R11 / P3 — Chi tiết chuyên sâu còn khó đọc | Regex/Cron vẫn có nhiều label 10/11 px, sample chip nhỏ; result match bị truncate, thông tin đầy đủ ở detail. Là expert assessment, chưa có mức ảnh hưởng đo từ người dùng. | Nhãn có thứ bậc 12/13 px phù hợp; sample không thay input mà người dùng không nhận ra; thông tin match đọc/copy được; bảng/chip dùng được khi zoom và thao tác keyboard. |
| R12 / P2 — Toolbar chiếm chỗ làm việc thực tế | Baseline production tại 720×500: JSON toolbar cao 143 px; editor input được đo 123 px, output ở dưới fold. Regex toolbar 99 px; test input bắt đầu ở y=410, khoảng 55 px nhìn thấy trước footer, dù editor layout cao 153 px. Render pass không phát hiện mức khó thao tác này. | Giữ hành động chính và input/result dễ tới; thu gọn thao tác phụ/help/samples, kiểm tra khả năng nhập, đọc, copy và scroll chứ không chỉ `scrollWidth`. Không giải quyết bằng cách giảm text/button đến khó dùng. |

Số đo R12 đến từ fixture production trong [deep workflow smoke](../tests/deep-workflows-ui.smoke.mjs)
và ảnh baseline đã xem: [JSON 720×500](C:/Users/tdpha/.codex/visualizations/2026/10/05/01a109db-4257-7b81-9bd9-443cbe013ca2/ux-deep-json-before-720.png),
[Regex 720×500](C:/Users/tdpha/.codex/visualizations/2026/10/05/01a109db-4257-7b81-9bd9-443cbe013ca2/ux-deep-regex-before-720.png).
Đây là artifacts tại máy review, không được đóng gói vào app.

## Trạng thái triển khai của vòng này

“Đã triển khai” bên dưới nghĩa là đã có thay đổi source trong working tree; không
thay cho kết quả functional/native QA. Những phần chưa xử lý được ghi riêng để
không biến danh sách phát hiện thành lời hứa đã hoàn tất toàn bộ UX.

| Phát hiện | Trạng thái source | Phạm vi còn lại |
|---|---|---|
| R1 | Palette có search field/focus riêng, không lồng viền browser. | Kiểm tra hình, keyboard và zoom trong harness; screen reader thật vẫn cần riêng. |
| R2 | Hướng phục hồi lỗi tải được làm rõ thay vì hứa retry lại cached rejected import. | Kiểm tra injected chunk failure và render failure riêng; không tự reload workspace. |
| R3–R4 | Loader dùng hoạt ảnh logo nhỏ, feedback chờ lâu và live status riêng; palette shell phản hồi trước phần nội dung lazy. | Đo cold/warm và kiểm tra reduced motion; không coi hoạt ảnh là bằng chứng giảm RAM hay hài lòng. |
| R5–R6 | Context menu có keyboard invocation/navigation, guard shortcut, stable opener, viewport portal/clamp và scroll. | Focused RAM-vault fixture; native menu/keyboard/zoom các OS khác cần riêng. |
| R7 | Base64 và Regex giữ mode/options trong draft RAM cùng input. | Tool khác chưa được migrate hàng loạt; security/vault/history denylist giữ nguyên. |
| R8 | Regex, AES/HMAC đã chuyển layout theo workspace với Input/Output tabs khi hẹp. | Kiểm tra vùng nhập/kết quả thực, keyboard focus khi action đổi pane và late-result guards; không tự coi mọi pane đã được chuẩn hóa. |
| R9–R10 | Keep dùng semantic theme + note palette theo theme và named Delete dialog; Cancel nhận focus, busy giữ dialog, lỗi giữ draft RAM. | Contrast/state/vault fixture riêng; captured session/path và editor identity kiểm tra sau IO. Không thay on-disk format hoặc thêm Undo giả. |
| R11 | Regex và Cron có nhãn/help/actions rõ hơn; Cron có Schedule/Upcoming runs tabs, preset Undo, linked field errors và export. | Tool chuyên sâu chưa được xác nhận mọi tổ hợp input hoặc native state. |
| R12 | JSON/Regex giảm toolbar luôn hiển thị và dành lại vùng nhập/kết quả. | Deep workflow smoke cần ghi before/after và hành vi thực; không chỉ render count. |

Review performance còn tìm thấy **editor bị tải sớm trên Home** dù component tool
lazy: chunk CodeMirror baseline 629,698 byte chứa JSX runtime, Home thực sự request
chunk đó. Chunk React được tách để bỏ dependency eager này. Báo cáo
[tool loading/performance](tool-loading-performance.md) ghi asset graph, phép đo
cold/warm và giới hạn; byte JavaScript tải bớt không tương đương số RAM Electron
giảm. Baseline loopback Edge chưa tái hiện độ trễ vài giây người dùng báo, nên chưa
có cơ sở kết luận máy người dùng hoặc lazy loading là nguyên nhân duy nhất.

## Hướng loading có thương hiệu nhưng nhẹ

Logo hiện có có thể làm nhân vật nhỏ “đang chuẩn bị” bằng SVG/CSS, không cần bitmap,
video, canvas loop hoặc thư viện animation. Animation chỉ có mặt khi chờ và biến
mất khi ready. Với reduced motion giữ hình tĩnh và text; không mất status khi tắt
animation. Nếu loader phải sống lâu, cập nhật lời giải thích và lối quay lại,
không biến spinner thành lời hứa phần trăm hoặc ETA chưa đo được.

Ngưỡng trì hoãn **chỉ hình trang trí** để tránh nháy khi tải rất nhanh là quyết
định implementation cần test; không được trì hoãn promise hoặc kết quả. Import
module không phải task có API hủy nên “quay lại danh mục” không được ghi thành
“hủy tải”. Lazy loading giúp trì hoãn công việc; không có bằng chứng nó tự gỡ
tất cả module khỏi RAM sau khi rời tool. Đo cold/warm click-to-ready, long tasks
và footprint riêng trước khi hứa cải thiện memory.

## Kịch bản để đánh giá độ tiện lợi thật

Các scenario dưới đây là kế hoạch kiểm chứng, **chưa có participant chạy**. Cách
viết dựa trên tác vụ thực, khuyến khích hành động và tránh chỉ vị trí/nút bấm theo
[NN/g Task Scenarios](https://www.nngroup.com/articles/task-scenarios-usability-testing/).

| Tác vụ | Thành công quan sát được | Điều ghi nhận |
|---|---|---|
| Bạn nhận JSON khó đọc và một lỗi cú pháp; làm nó hợp lệ và mang kết quả sang editor khác. | Tìm đúng tool, sửa đúng lỗi, copy kết quả đúng byte. | Thời gian tìm, chỗ click sai, cách dùng hint, nhầm input/output. |
| Có Unix timestamp nhưng không biết giây hay milliseconds; xác định ngày ở múi giờ đồng nghiệp. | Chọn đúng đơn vị và timezone, giải thích được kết quả. | Nhầm đơn vị, hiểu ví dụ, cách khôi phục khi input sai. |
| Frontend cần `/users` có lỗi 401 khi thiếu auth và dữ liệu khi đủ header. | Tạo config, chạy đúng response, biết server có còn hoạt động trong tray. | Nhầm thứ tự rule, header, Start/Apply/Stop và status. |
| Bắt một đoạn chữ từ ảnh màn hình và sửa kết quả trước khi copy. | Dùng capture/upload đúng, nhận biết trạng thái OCR, sửa và copy. | Kỳ vọng vùng OS, nhận biết cancel, chờ lâu, tìm result. |
| Đang viết note chưa lưu và muốn đổi tool rồi quay lại. | Không mất note ngoài ý định, hiểu Save/Discard/Stay. | Hiểu encrypted save và temporary state, lỗi write/retry. |
| Một dev server giữ port; giải phóng đúng process. | Chọn đúng PID/port, hiểu stop ảnh hưởng mọi listener của process. | Hiểu classification, confirm, scan cũ và khả năng từ chối. |
| Trong lúc mở tool lần đầu, đổi ý sang tool khác. | Có thể rời loading; route cuối cùng thắng, không status từ tool cũ. | Cảm nhận chờ, bấm lặp, khả năng nhận biết state. |

Đợt usability study có thể tuyển một nhóm nhỏ developer mới và người quen tool,
ghi consent và dùng dữ liệu fixture. Ghi completion có/không, thời gian thực tế,
lỗi và lời nhận xét nguyên văn; tổng hợp theo số participant thật, không suy rộng
từ sample nhỏ. So sánh trước/sau cùng kịch bản, tách tốc độ máy và trạng thái cache.

## Kiểm chứng cần gắn với kết quả triển khai

1. Tái hiện screenshot focus và injected chunk failure; lưu ảnh before/after.
2. Cold/warm profiling dùng production bundle, asset requests thực và môi trường
   ghi rõ; slowdown injection chỉ kiểm tra feedback, không phải latency thực.
3. Flow tests kiểm tra nhập → action → error → recovery → copy; mở lại mode/options
   và nhấn shortcut trong overlay. Render sweep vẫn là một lớp kiểm tra phụ.
4. Windows Electron native fixtures cho focus/window/vault interactions; không
   thao tác vault/clipboard thật. Native macOS/Linux và screen reader cần kiểm tra
   riêng nếu chưa có môi trường.
5. Không biến nghiên cứu thành background telemetry, preload toàn catalog,
   persistent secret drafts hoặc thay đổi format vault để làm UX thuận tiện.

Kết quả test và trạng thái đã sửa cần ghi trong báo cáo triển khai; phần này
đặt acceptance criteria, không tuyên bố những check chưa chạy là đã đạt.

## Kết quả kiểm chứng của đợt triển khai

Đã hoàn tất `pnpm typecheck`, `pnpm build` và Vitest **756 test / 84 file**.
Build còn cảnh báo chunk SQL khoảng 2.9 MB; SQL vẫn lazy. Các kiểm tra dùng
production bundle, profile riêng và dữ liệu fixture, không truy cập vault,
clipboard hoặc dữ liệu thật của người dùng:

| Kiểm tra | Kết quả quan sát |
|---|---|
| `loading-feedback-ui.smoke.mjs` | Giữ chunk đang chờ và inject lỗi tải; palette phản hồi ngay, Tab/Escape/focus return; focus inset không cắt; lời chờ lâu, quay về tool khác, route cuối thắng; motion hữu hạn dưới 5 giây và reduced motion tĩnh; light/dark ở logical viewport tương đương zoom 100/125/150/200%. |
| `deep-workflows-ui.smoke.mjs` | JSON format/minify/file/Clear/Sample Undo và lỗi file giữ input; pane tabs, readonly/copy/download, focus khi resize; Regex lỗi đúng field, match selection reset, 50-row paging nhưng copy đầy đủ, worker cancel/recovery; Base64/Regex mode/options/input khôi phục cùng nghĩa trong RAM; HTTP row focus/Undo; light/dark 720×500, JSON reflow tương đương 200%. |
| `privatebox-menu-ui.smoke.mjs` | Vault RAM fixture: Shift+F10, arrow/Home/End, bỏ item disabled; Enter gọi một lần; Delete/F2 không chạy phía sau; menu/dialog/palette chuyển focus đúng; bounds/scroll/resize và visual viewport 2×; focus ngoài menu không bị lấy lại. |
| Các UI harness hiện có | Navigation, shared UI, Keep/color/editor, Mock/API/HTTP, Lorem/Time và OCR đều pass; catalogue sweep 39 tool × 2 theme × 2 kích thước = 156 view, cùng contrast token/fill/border và window-control labels. |
| `electron-security.smoke.mjs` | Electron Windows thật: file-URL production YAML worker/preload, stale-session write bị từ chối và dữ liệu box khác giữ nguyên, external navigation/protocol popup bị chặn, window destruction zeroes keys. |
| `tool-loading-performance.smoke.mjs` | Ba vòng cold/warm, runtime asset graph và worker lifecycle; native hidden Electron memory snapshots. Home JS từ 966 xuống 354 KiB; YAML/Regex initial results nhanh hơn trong fixture. [Bảng số đo và giới hạn](tool-loading-performance.md). |

Ở 720×500, toolbar luôn hiển thị của JSON từ 143 xuống 51 px; editor input đo từ
123 lên 184 px. Regex toolbar từ 99 xuống 57 px, vùng editor từ khoảng 55 lên
125 px. Output/results truy cập bằng tab rõ tên ở workspace hẹp; hai pane vẫn
mounted, không mất editor state. Đây là số đo bố cục của fixture, không phải tỷ lệ
hài lòng của người dùng. Ảnh after và JSON kết quả nằm trong thư mục artifacts
`ux-review` của phiên làm việc; before giữ riêng từ baseline.

R1–R7, phần Regex của R8/R11 và R12 đã có regression evidence theo phạm vi trên.
Vòng tiếp theo xử lý Keep, AES/HMAC và Cron; kết quả riêng được ghi bên dưới.
Chưa có participant usability study, NVDA/VoiceOver hay native macOS/Linux test.
Không tuyên bố app “best UX”, không có bug, hoặc đạt chứng nhận WCAG từ automated QA.

## Vòng tiếp theo: Keep, crypto, Cron và native zoom (2026-10-06)

Tiêu chí của vòng này dựa trên [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
và [W3C APG Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
đo màu foreground/background được render thực, giữ focus trong dialog đang hoạt
động, Cancel nhận focus cho thao tác phá huỷ, trả focus khi đóng. Đây là áp dụng
hướng dẫn cho các luồng cụ thể, không phải chứng nhận toàn app.

Baseline Keep có 60 cặp chữ/nền trong hai theme: tỷ lệ thấp nhất **2.73:1**;
search placeholder 3.37:1, pinned label 3.74:1 và empty card 3.03:1. Shared-token
contrast tests trước đó đã bỏ sót các màu hardcoded này. CSS mới chỉ import cùng
lazy KeepApp; màu note lưu trên đĩa vẫn giữ nguyên ID, appearance theo theme.

AES tại 720×500 trước sửa có editor Input 123 px nhưng Output nằm ở y=515–636,
ngoài viewport; tại 900×500 chia hai cột 314 px dù workspace chỉ rộng 668 px.
Cron trước sửa đặt lịch chạy dưới field breakdown/presets. Các tool nay quyết
định pane theo workspace, nhãn rõ và thao tác phục hồi nằm cạnh tác vụ.

R13 / P1: Ctrl+K mở search đè lên dialog xác nhận/đang xoá. Test thực còn phát hiện
bản guard đầu tiên kiểm tra `aria-modal=true` không đủ: Radix modal dùng `role=dialog`,
focus scope và `aria-hidden`, không nhất thiết gắn `aria-modal`. Guard sửa theo
role dialog/alertdialog thực đang mount; regression phải kiểm tra dialog cũ vẫn
visible và search chưa xuất hiện, thay vì chỉ đếm tổng dialog visible.

AES/HMAC không thêm session drafts, history hoặc localStorage cho key/message.
AES giữ stale-result guard, output chỉ xuất hiện khi request còn hiện hành, và
sửa focus khi kết quả chuyển pane từ keyboard. HMAC bắt đầu bằng key rỗng và nêu
rõ key UTF-8; định dạng Hex/Base64 chỉ áp dụng output. Crypto bytes/format giữ nguyên.
Cron chỉ thêm draft RAM cho timezone/count/start cùng expression; export vẫn dùng
schema cũ, không tạo scheduled job. Keep Delete dùng captured box/session/path/id,
không cập nhật editor khác sau awaited IO; lỗi chỉ đảm bảo draft RAM vẫn ở đây,
không hứa file trên đĩa còn nguyên nếu kết quả xoá không thể xác nhận.

### Kết quả kiểm chứng vòng tiếp theo

Bản production cuối của vòng này đã qua `pnpm typecheck` và `pnpm build`.
Vitest toàn bộ vẫn **756 test / 84 file**. Build còn warning SQL chunk khoảng
2.9 MB; các thay đổi không preload SQL/editor/OCR engine trên Home.

| Kiểm tra | Kết quả và giới hạn |
|---|---|
| `keep-ux-ui.smoke.mjs` | 69 computed text contrast checks ở hai theme và 10 note colors, minimum **5.22:1**; baseline 60 comparable checks minimum 2.73:1. Delete nêu tên note, Cancel first focus, trap/Enter/Escape/opener return, busy Ctrl+K/double-click lock, failed remove giữ draft và retry, exact session/path, unrelated note giữ nguyên, success focus về Take a note; không dùng native confirm hoặc plaintext localStorage. |
| `renderer-ux.smoke.mjs` | Keep draft guards khi tray/sidebar/Back/beforeunload/palette, failed Save/retry, Save-before-signout/discard, nested focus và payload pass trên integration build trước bước thêm success focus; hành vi success focus kiểm tra riêng trên final build. |
| `crypto-tools-ui.smoke.mjs` | AES Unicode/empty plaintext round-trip, wrong password/invalid ciphertext, stale request suppression và focus; HMAC 3 algorithms × 2 encodings so với Node digests độc lập, empty message/key validation, late sign suppression, clipboard retry, route-exit privacy và storage. 12 views light/dark × 720/900/1200 × 500, plus two logical 360×250 scroll cases. Focused crypto/session suite: 25 tests / 2 files. |
| `cron-ui.smoke.mjs` | Expression→timezone/start/count→preview→copy/download, expression/count/date validation và Fix focus, preset Undo/manual-edit invalidation, complete RAM restoration, optional seconds/strict fractional start, DST fold distinct UTC instants. Light/dark 720×500 và 1180×760; logical 360×250 yêu cầu phần chữ/input visible sau khi giao với mọi clipping ancestor. Focused domain suite: 17 tests / 2 files. |
| `shared-ui.smoke.mjs`, `privatebox-menu-ui.smoke.mjs`, `navigation-ui.smoke.mjs` | Dialog Ctrl+K không mở palette đè lên Endpoint/Rename; focus còn trong dialog cũ. Menu isolation, bounds/scroll/focus, navigation và unique palette options pass. Fixture chờ lazy search content trước khi đếm options, không nhầm frame đã mở với contents đã ready. |
| `loading-feedback-ui.smoke.mjs` | Feedback khi first-load, finite/reduced motion, slow notice/navigation, failed chunk recovery và logical zoom tests vẫn pass sau dialog guard. |
| `electron-ux-zoom.smoke.mjs` | Windows Electron **44.5.1 / Chromium 152.0.7977.130**, actual `setZoomFactor` 100/125/150/200%: palette fits, focus inset và Escape/opener return ở light/dark. JSON input/output tại 1180×760/2x; AES/HMAC và Cron tại **720×500/2x**, actual clipping-ancestor intersection + scrolling/focus cho input/output. Hidden isolated fixture đổi theme bằng UI thật, assert actual color-scheme, dùng webContents focus, giữ sandbox/contextIsolation/webSecurity và không có vault bridge. QA này kiểm tra DOM/focus/computed bounds, không khẳng định bitmap frame của cửa sổ ẩn đã paint đúng. Không tương đương native macOS/Linux hoặc screen-reader QA. |

Ở 900×500, crypto Input rộng **314→642 px** do bỏ breakpoint viewport sai.
Ở 720×500, AES Input cao **123→96 px**, là tradeoff để password/actions/tabs và
Output **94 px** đều tới được; output cũ y=515–636 nằm ngoài màn hình. Không mô tả
đây là tăng diện tích mọi pane. Cron first run hiện ở y=375–414 tại 720×500 khi
chọn Upcoming runs, và y=328–367 tại 1180×760. Before Cron chỉ được dùng như
quan sát định tính: lịch chạy nằm sau presets/breakdown; ảnh baseline bị một lần
rerun đè trong lúc build đã đổi bundle nên không dùng làm benchmark hình học.

Short-height test còn phát hiện editor/result từng co về 0 px. Các crypto/Cron
workspace nay có minimum pane height cùng outer vertical scroll; không giảm
font/target size để che lỗi. Computed bounds alone không đủ: tests scroll đến
control/result rồi giao bounds với viewport và clipping ancestors.

R8–R11 và R13 đã có evidence theo phạm vi trên; backlog không còn ghi Keep,
AES/HMAC hoặc Cron là chưa triển khai. Usability study với người dùng thật,
NVDA/VoiceOver, native macOS/Linux và các tổ hợp input/platform chưa thử vẫn cần
kiểm tra riêng. Artifact JSON/PNG nằm trong thư mục `ux-review` của phiên làm việc.

### Backlog còn lại được quan sát trong source

Private Box `DesktopDesktop.tsx` vẫn có native `window.confirm` cho document
Delete và unsaved discard/signout. R10 của vòng này áp dụng cho Keep; không có
cơ sở nói mọi confirmation trong app đã đổi sang named modal. Luồng vault này
cần một vòng focused data-preservation/session/focus QA riêng khi thay dialog.
Build SQL chunk lớn vẫn là mục performance cần profile theo sử dụng thực; không
đưa toàn bộ engine vào Home để làm lượt mở đầu trông nhanh hơn.

Trong QA, fixture native đầu tiên chỉ ghi localStorage rồi loadFile cùng file với
hash khác nên store vẫn thuộc document cũ; check theme thực phát hiện điều đó.
Fixture cuối dùng nút theme thật và assert computed color-scheme. `capturePage`
ở window ẩn còn trả frame cũ trong phép thử này; các PNG đó đã đổi tên
`diagnostic-unreliable-*` và không dùng làm ảnh before/after hoặc kết quả. Ảnh UI
đã xem dùng production browser fixtures; native evidence là JSON computed bounds,
clipping, theme và focus được assert riêng. Phân biệt in-page navigation theo
[Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents#navigation-events).

Lượt asset-graph cuối vẫn chứng minh Home giữ editor/SQL/OCR engine lazy, JavaScript
Home 362,449 byte (354 KiB). Một sample SQL cold có 4.31 s, trong đó SQL chunk tải
3.79 s; ba vòng lặp yên hơn cho 286/353/260 ms. Không xoá sample chậm hoặc khẳng
định lazy luôn nhanh: [performance report](tool-loading-performance.md#continuation-verification-2026-10-06)
ghi raw timing, repeat medians và giới hạn nguyên nhân. Không thêm prefetch idle
để che độ trễ bằng cách tăng bộ nhớ trước khi người dùng mở tool.

Catalogue sweep final: 39 tool × 2 theme × 2 kích thước = 156 view pass. Electron
security fixture final vẫn pass file-URL YAML worker/preload, stale-session refusal
và giữ box B, external navigation/protocol blocking, zero keys khi destroy.
`SESSION_CHANGED` trong log là lỗi được chủ động inject và phải bị từ chối;
không tính log này thành runtime success của một write thật.
