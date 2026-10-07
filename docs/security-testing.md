# Hacking / Security Testing

Nhóm riêng dành cho kiểm thử hệ thống do developer sở hữu hoặc được phép kiểm
thử. Các tool tải lazy và giữ ngôn ngữ giao diện macOS/Liquid Glass hiện có.
Không có request, upload, listener mạng hay dò hash tự chạy khi mở nhóm.

| Tool | Chức năng |
|---|---|
| API Stress Test | URL, method, query parameters, headers, JSON/text/form body; số lượt, tốc độ bắt đầu request, concurrency, timeout, thời gian; Stop và thống kê tải |
| Hash Lab | Text → MD5/SHA-1/SHA-256/SHA-512; thử dictionary hoặc tổ hợp alphabet để tìm candidate có cùng digest |
| HTTP Security Headers | GET/HEAD; quan sát HSTS, CSP, framing, nosniff, referrer policy và thông tin server |
| CORS Policy Probe | OPTIONS preflight và GET sample cho một Origin, method và danh sách tên header |
| JWT Security Review | Kiểm tra thuật toán mong đợi, issuer/audience, thời gian và key hints; xử lý offline |

## Cảnh báo và phiên đồng ý

Lần đầu vào **mỗi tool** trong phiên app, giao diện hiển thị logo đỏ, trạng thái
đang kiểm tra và cảnh báo tiếng Việt. Nội dung nhắc chỉ kiểm thử hệ thống được
phép, không tấn công/truy cập trái phép/dò mật khẩu người khác/gây gián đoạn;
người dùng tự chịu trách nhiệm về mục đích và tác động. Stress request ghi có thể
thay đổi dữ liệu. Người dùng phải nhấn **Đồng ý** trước khi component tool mount.
Heading nhận focus; logo loading tôn trọng reduced motion; có Quay lại và retry
nếu kiểm tra/ghi nhận đồng ý thất bại.

Main process giữ Set ID tool trong RAM, dùng chung cho các cửa sổ của phiên app.
Chuyển tool hoặc reload renderer không xóa đồng ý. Thoát app hoàn toàn rồi mở
lại sẽ hỏi lại. Đóng cửa sổ xuống tray vẫn là cùng phiên. Browser preview chỉ
có Set tạm trong renderer và không cung cấp network testing.

Cả consent lẫn thao tác mạng dùng named typed preload methods và trusted
main-frame IPC. Main kiểm tra consent riêng cho stress/headers/CORS trước khi
chạy và xác thực payload ở runtime. Đồng ý là xác nhận của người dùng, không
phải bằng chứng họ có quyền trên target. Không lưu consent vào settings/disk.

## Ngân sách xử lý và Stop

API Stress Test giới hạn tại main: 1–10.000 lượt, 1–50 lượt bắt đầu/giây,
concurrency 1–20, thời gian 1–600 giây; một stress test trong toàn app và một
tác vụ mạng Security Testing trên mỗi cửa sổ. Scheduler không tích lũy lượt để
gửi bù thành burst. Timeout request tối đa 30 giây; body tối đa 64 KiB UTF-8,
header tối đa 16 KiB. URL theo profile HTTP hiện có: HTTP(S), ≤8.192 ký tự,
không credentials trong URL hay header injection.

Response được stream rồi bỏ, không giữ plaintext body. Mỗi response dừng đọc
tại 256 KiB; bộ đếm bao gồm toàn bộ chunk cuối nên có thể vượt ngưỡng một chunk.
Stress dừng tại tổng 128 MiB; các request đã in-flight có thể thêm một lượng
bounded trước khi nhận abort. Không theo redirect và không tắt xác thực TLS.
Stop, navigation, đóng owner và quit abort scheduler cùng request đang chạy;
UI chờ drain trước khi cho chạy lại. Input bị khóa trong lúc chạy.

Metrics gồm started/completed/active, 2xx, 4xx/5xx, network errors, cancelled,
status counts, tốc độ bắt đầu/hoàn thành thực tế, bytes và nearest-rank
p50/p95/p99/max. Network errors/cancelled không có mẫu latency response.
Redirect không tính là success hoặc HTTP error. Latency đo đến khi đọc xong
response hoặc chạm cap, không luôn là thời gian tải toàn body. Tốc độ thực tế
phụ thuộc concurrency, độ trễ server và thời gian khởi động/drain.

Hash Lab dùng worker riêng, terminate khi Stop/rời tool/hoàn tất. Generate giới
hạn 1 Mi ký tự và 5 giây. Search tối đa 10 triệu attempts và 600 giây; watchdog
renderer terminate worker sau budget +1 giây nếu worker chưa phản hồi.
Dictionary tối đa 1 Mi ký tự, 100.000 dòng, mỗi dòng ≤1.024 ký tự; giữ nguyên
spaces, loại duplicate, dòng trống thử chuỗi trống. Alphabet là 1–64 ký tự ASCII
printable khác nhau, chiều dài 0–16, không materialize toàn bộ candidate space.
Candidate tìm thấy mặc định ẩn; Reveal rồi Copy là hành động chủ động. Có import
file UTF-8 tối đa 4 MiB (sau decode vẫn áp dụng giới hạn dictionary). Read về muộn
sau edit, Clear, Start hoặc rời tool không được khôi phục input cũ.

Ba tập mẫu nhỏ (candidate thường gặp, giá trị mặc định môi trường dev, chuỗi số)
được bundle tại máy; không tải wordlist ngoài. User có thể thêm nhiều tập và import
dictionary riêng. Biến thể giữ candidate gốc, thêm lowercase/uppercase/capitalize
và tối đa 16 hậu tố, mỗi hậu tố ≤32 ký tự. Loại duplicate dòng gốc và hậu tố;
tổ hợp giữa các từ/biến thể có thể tạo lượt thử lặp. Sinh biến thể lazy, không
materialize toàn bộ tập mở rộng. Search plan đếm lượt đã lên kế hoạch và hiển thị
sáu candidate đầu trước khi chạy; không hứa tìm được preimage.

Live monitor hiển thị số lượt, tốc độ, elapsed, tiến độ theo attempt budget và
ước tính thời gian còn lại. Time budget vẫn có thể dừng sớm hơn ước tính. Preview
được bật trong màn hình và có thể tắt; worker chỉ gửi tối đa sáu candidate không
khớp gần nhất mỗi 250 ms, cùng snapshot đầu/cuối. UI không thêm thời gian chờ giả
vào việc tính hash. Animation nhẹ, tắt với reduced motion. Candidate trùng digest
không vào live feed; vẫn cần Reveal. Copy report chỉ chứa thuật toán và metrics,
không chứa target digest, dictionary, live candidates hay match plaintext.

Hash không thể giải mã ngược. Search chỉ tìm preimage trong tập candidate cho
raw unsalted hexadecimal digest; không hỗ trợ bcrypt/Argon2/salt/mask nâng cao.
Một candidate trùng hash không chứng minh nó là input ban đầu. MD5/SHA-1 là
thuật toán legacy, không phù hợp để lưu mật khẩu.

## Cách hiểu kết quả

Stress có preset Quick check / Baseline / Sustained load, thời gian gửi tối thiểu
theo count/rate và ngưỡng p95/tỷ lệ lỗi do user đặt. Tỷ lệ lỗi dùng response ngoài
2xx và network failures; loại cancelled khỏi mẫu. Chỉ một run `completed`, gửi đủ
count và có mẫu p95 hợp lệ mới được đánh giá đạt; stopped/duration-limit/byte-limit
hoặc thiếu mẫu là incomplete. Có thể đổi ngưỡng sau run để đánh giá lại metrics
đang hiển thị. Ngưỡng không thay đổi scheduler hoặc phát sinh request mới.

Header audit có thêm nguồn Paste response headers để đọc header tại máy, không
gọi IPC mạng. Parser giới hạn 64 Ki ký tự, 256 dòng header, 8 Ki mỗi dòng; từ chối
folded header và response body, giữ giá trị lặp theo thứ tự bằng comma, dùng object
không prototype; từ chối nhiều status block để không gộp policy của redirect chain.
Không suy luận status hoặc tự theo redirect từ input paste.
Header/CORS/JWT findings có bộ đếm và filter All / Needs attention / Passed;
Copy report luôn giữ đầy đủ findings, không chỉ phần đang lọc. CORS có preset
untrusted/null/credentialed origin; đổi preset chỉ chỉnh form, cần nhấn Probe.

Header audit là quan sát policy, không phải chứng nhận hệ thống an toàn. CSP
hiện diện không chứng minh policy hiệu quả; unsafe-inline cần xem cả nonce/hash
và directive; HTML và API có yêu cầu khác nhau. Redirect chỉ review response
đầu. Hướng dẫn tham khảo: [OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html).

CORS probe chỉ kiểm tra một origin. Nó không gửi Cookie/Authorization, không
thực thi POST/PUT/DELETE; tùy chọn credentials chỉ dùng phân tích. Wildcard ACAO
với credentials bị browser chặn; phản hồi cho một origin không đủ chứng minh
arbitrary reflection hoặc rò rỉ dữ liệu. Authorization cần được allow rõ ràng;
Vary: Origin liên quan shared cache khi response thay đổi theo origin. Cần test
trong browser để xác nhận access thực tế. Tham khảo
[MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) và
[Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin).

JWT review không xác thực signature, không lấy remote keys và không chứng minh
token hợp lệ. Backend phải pin thuật toán, kiểm tra chữ ký/key source và claims.
Report luôn nêu rõ signature chưa được verify; token tối đa 64 Ki ký tự.
Tham khảo [OWASP JWT](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html).

## Privacy, kiểm chứng và recovery

Năm ID `hacking.*` nằm trong `NO_HISTORY_TOOLS`. Tool không dùng generic draft,
history hay persistent input settings; bỏ input khi rời màn hình. Main chỉ
giữ payload trong thời gian thao tác; không ghi URL, authorization, body, token,
candidate hay plaintext vào log. Reports mạng/JWT gồm rule/metrics, bỏ raw
header/claim values và request URL/body. Copy digest hoặc candidate plaintext
là hành động riêng do người dùng chọn và đưa dữ liệu vào clipboard hệ thống.

Regression tests kiểm tra runtime bounds, pacing/concurrency, cancellation,
timeout/stream cap, header/CORS semantics, JWT và hash candidates. Network test
thực chỉ dùng server loopback. Browser smoke chạy production hash worker và
network bridge fixture; native Electron smoke dùng preload thật, file-URL CSP,
main consent và stress IPC đến localhost. Không có stress test trên target
internet. Dừng tải ngoài ý muốn bằng Stop; nếu cửa sổ treo, thoát app để main
abort toàn bộ tác vụ. Không có persistent job hoặc queue tự chạy lại.

Lệnh kiểm tra: `pnpm test --maxWorkers=4`, `pnpm typecheck`, `pnpm build`,
`pnpm test:ui:security-testing`, `pnpm test:electron:security` và
`pnpm test:electron:packaged`. Native macOS/Linux và remote CI cần chạy trên host
tương ứng; Windows smoke không thay thế chúng.

Kết quả local Windows ngày 2026-10-06: 973 tests / 103 files pass (69 tests của
domain/service mới và 5 privacy cases được thêm vào suite hiện có); typecheck
node/web và build pass. UI Security Testing pass với real hash worker, Stop và
time budget; catalogue 50 routes pass ở light/dark, 1180×760 và 720×500. Các
smoke UI enterprise/vault/advanced hiện có cũng pass. Electron development và
ASAR/fused fixture pass với consent, file-URL worker và localhost stress IPC.
Bản `release/win-unpacked` được cập nhật và kiểm tra fuses; đây là bản unsigned,
không phải installer đã ký số. Remote CI và native macOS/Linux chưa chạy local.

## Kiểm chứng refactor UI/UX ngày 2026-10-07

Full suite: 1.013 tests / 108 files pass. Các tests mới chứng minh thứ tự và
giới hạn biến thể, candidate dài, progress không lộ match, preview opt-in ở
worker contract, parser header không prototype và đánh giá tải không pass run
thiếu mẫu. Typecheck node/web và production build pass; warning lazy SQL chunk
2.9 MB hiện có vẫn còn. Test parser bổ sung cho redirect chain (10 cases) cũng pass.

Browser smoke kiểm tra cả 5 gate/tools ở light/dark và 1180×760 / 720×500,
production hash worker, các tập mẫu/biến thể/import, read về muộn sau Clear,
Stop/time budget, tắt preview, reports bỏ plaintext, offline header không gọi
network IPC, findings filters và CORS presets. Network metrics ở browser là
fixture; native Windows smoke dùng localhost và preload/CSP thật. Native smoke
đã qua consent, file-URL worker, stress IPC, invalidation và renderer recovery.
Smoke i18n kiểm tra 13 ngôn ngữ, labels mới và giữ nguyên candidate khi đổi locale.
Không có chứng nhận an toàn hệ thống hay kiểm thử native macOS/Linux trong lần này.
