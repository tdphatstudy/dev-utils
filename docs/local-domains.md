# Local Domains

Local Domains cho phép mở ứng dụng local bằng domain: ví dụ `toi.vn` →
`127.0.0.1:3000`, hoặc `https://app.test` → ứng dụng HTTP trên port 3000.
Tool nằm trong nhóm Network của DevFusion desktop.

Hosts/DNS chỉ đổi domain thành IP, không chứa port. DevFusion kết hợp hai phần:
hosts trỏ domain về `127.0.0.1` và `::1`; reverse proxy trên loopback chuyển
request HTTP/HTTPS sang loopback `<targetPort>` (IPv4 hoặc IPv6). Không có DNS daemon, relay hay
hạ tầng bên ngoài. HTTPS là kết nối browser → proxy; app đích có thể dùng HTTP.

## Thêm và bật mapping

1. Chạy app local, ví dụ trên port 3000.
2. Mở **Network → Local Domains**, nhập `app.test` và target port `3000`.
   Nên dùng `.test` cho tên thử nghiệm. Domain thật như `toi.vn` cũng được hỗ trợ,
   nhưng sẽ tạm thay địa chỉ bình thường của domain trên máy này.
3. Chọn **Use HTTPS** nếu cần; thực hiện Setup HTTPS bên dưới trước khi bật.
4. **Save mapping** chỉ lưu cấu hình ở trạng thái Disabled.
5. **Enable → Enable mapping**, chấp nhận yêu cầu quyền hệ thống khi có.
6. **Open** mở URL đã lưu trong browser. **Copy URL** dùng để copy URL chính xác.

Proxy mặc định dùng 80/443 để URL không cần ghi port. Nếu bị chiếm port hoặc OS
không cấp quyền bind port thấp, Disable all rồi đổi **Proxy ports** thành
8080/8443. URL lúc đó là `http://app.test:8080` hoặc `https://app.test:8443`.
Không cần chạy toàn bộ Electron bằng quyền root/admin.

Nếu dev server từ chối Host mới, thêm domain vào allowlist của dev server theo
tài liệu framework; DevFusion giữ Host của domain, không bỏ cơ chế kiểm tra Host.
Target hiện tại phải là HTTP trên loopback; upstream HTTPS và remote targets
chưa được hỗ trợ. Proxy thử IPv4 và IPv6 nên app chỉ bind `::1` vẫn hoạt động,
không dùng DNS để tìm upstream. WebSocket upgrades được chuyển tiếp.
Domain chỉ hỗ trợ ASCII; dùng tên punycode nếu cần. Wildcard, `.local` (mDNS),
URL đầy đủ và chuỗi chứa port bị từ chối.

## HTTPS local

DevFusion dùng [mkcert](https://github.com/FiloSottile/mkcert) đã cài trên máy;
không tải hay cài binary tự động. Cài mkcert theo hướng dẫn chính thức, bảo đảm
binary có trong PATH rồi khởi động lại DevFusion.

**Setup HTTPS** yêu cầu xác nhận trong dialog hệ thống. Sau đó mkcert tạo CA
riêng với `CAROOT=<userData>/local-domains/ca`, `TRUST_STORES=system` và cài trust.
Không dùng/chỉnh CA mkcert mặc định của người dùng. Sau khi bật mapping HTTPS,
chứng chỉ của domain được tạo trong thư mục riêng của mapping.

Thông báo “CA setup completed” ghi nhận lần setup thành công, không phải kiểm tra
trust thực tế của mọi browser/runtime. Firefox hoặc runtime có trust store riêng
có thể cần cấu hình riêng. Nếu trust bị gỡ bên ngoài, dùng Setup HTTPS để cài lại.
Nếu OS từ chối quyền, thông báo cung cấp CAROOT chính xác để setup từ terminal.

Disable domain không gỡ CA. Disable all rồi chọn **Remove HTTPS trust** để gọi
mkcert `-uninstall` cho CA riêng này. File CA và khóa vẫn được giữ trong storage
được bảo vệ để không mất recovery material; không gửi hoặc chia sẻ khóa CA.
Remove mapping xóa cặp certificate/key của mapping, không xóa CA.
Windows áp ACL cho user hiện tại trước khi tạo khóa; Unix dùng directory 0700.
Cặp file thiếu một thành phần bị từ chối thay vì tạo lại đè lên thành phần còn lại.

## Dừng thử nghiệm và trở về domain thật

- **Disable** gỡ hai hosts entries có marker của domain, dừng route/socket đang
  dùng domain đó, flush DNS hệ thống khi adapter hỗ trợ và clear resolver cache
  của DevFusion. Mapping lưu sẵn vẫn còn để bật lại.
- **Remove** thực hiện bước Disable trước rồi xóa cấu hình và certificate riêng.
- **Disable all / Remove local overrides** gỡ mọi entry do DevFusion quản lý,
  kể cả entry không còn cấu hình sau crash. Chỉ cần một lần cấp quyền hệ thống.
- **Check resolution → Check address** kiểm tra IP hiện tại mà OS trả về. Đây là
  thao tác chủ động có thể thực hiện DNS query; không tự chạy khi mở tool.

Proxy phát `Cache-Control: no-store`, bỏ HSTS/Alt-Svc từ upstream và chuyển
redirect 301/308 thành 302/307 để giảm lưu trạng thái local lâu dài.
Flush DNS trên Windows dùng
[`ipconfig /flushdns`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig).
macOS dùng dscacheutil + mDNSResponder; Linux dùng resolvectl hoặc nscd nếu có.
Nếu flush không thành công, hosts vẫn được đọc lại để xác minh kết quả và UI báo
warning; không báo thao tác thất bại giả khi hosts đã thực sự đổi.

**Không thể bảo đảm xóa cache của mọi browser.** Tab mở sẵn, kết nối keep-alive,
service worker, site data và browser DNS cache thuộc browser ngoài DevFusion.
Sau Disable, nếu browser vẫn mở nội dung local, đóng tab cũ, clear site data của
domain (bao gồm service workers), rồi restart browser. IP không phải loopback
không chứng minh website thật đã reachable.

Domain thật có thể đã có
[HSTS/preload policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security)
từ trước: browser có thể bắt buộc HTTPS ngay cả khi chọn HTTP trong tool.
Dùng HTTPS đã trust cho domain đó hoặc dùng một domain `.test` khác. DevFusion
không gỡ chính sách HSTS có sẵn của browser và không xóa cookies/site data tự động.

Các đuôi `.app`, `.dev` và `.page` bắt buộc HTTPS trong browser do HSTS preload
cho toàn đuôi ([Google Registry](https://developers.googleblog.com/en/build-security-into-your-next-website/)).
Ví dụ `uctalent.app` → HTTP không mở được trong Chrome dù hosts và proxy đúng.
Tool hiển thị hướng dẫn khi nhập/lưu các tên này với HTTP và khóa nút Open;
mapping HTTP vẫn dùng được cho client không áp dụng HSTS. Với mapping HTTP đã lưu,
Remove rồi lưu lại với **Use HTTPS**, chạy **Setup HTTPS** và Enable; hoặc dùng
`uctalent.test` nếu chỉ cần HTTP. Không tự đổi giao thức hoặc sửa metadata cũ.

## Lifecycle, dữ liệu và recovery

Mở hoặc preload giao diện không bind port, sửa hosts, chạy mkcert hay thêm trust.
Chỉ mapping được Enable mới tạo proxy; listener đóng khi không còn route.
HTTP bodies được stream (giới hạn request 8 MiB), tối đa 64 request đồng thời,
header 16 KiB và timeout upstream 30 giây; WebSocket idle timeout 120 giây.
Không buffer toàn bộ response; không ghi request/response vào settings/log/history.

Mapping đang bật tiếp tục chạy khi đóng cửa sổ vào tray. Quit chặn Enable mới và
thử gỡ hosts trước khi thoát. Nếu hủy quyền hoặc cleanup lỗi, dialog mặc định giữ
app mở để retry; lựa chọn Quit with overrides remaining cảnh báo rõ hosts còn
trỏ localhost. Nếu hủy quit vì unsaved edits, lần quit sau sẽ cleanup lại.

Crash/kill/mất điện không thể chạy cleanup. Lần mở lại, DevFusion không tự bật
proxy hoặc sửa hosts. Tool hiển thị **Local overrides need attention** để Resume
mapping hoặc Remove local overrides. Cấu hình JSON hỏng không bị ghi đè; chức năng
Remove local overrides vẫn hoạt động độc lập với metadata. Người dùng sửa marker
trong hosts làm ownership không rõ ràng thì tool từ chối; hãy kiểm tra và sửa/xóa
dòng marker đó thủ công.

Storage trong `<userData>/local-domains`:

- `domains.json`: version 1, domain/UUID v4/target port/HTTPS và port proxy;
  không lưu trạng thái active, credentials hay nội dung request.
- `ca/`: CA riêng, khóa CA và marker setup thành công.
- `certificates/<UUID>/`: certificate và private key từng mapping.

Thao tác hosts giữ nguyên bytes/comment/alias/dòng không thuộc DevFusion, kiểm tra
hash trước ghi để từ chối race khi chờ quyền, khóa file, tạo backup cạnh hosts và
rollback lỗi ghi. Không chạy script tạm có thể sửa bằng quyền admin; code helper
được truyền inline. Lệnh chỉ chứa thao tác cho domain (hoặc gỡ toàn bộ marker),
không chứa toàn bộ hosts. Helper sửa snapshot đang khóa và kiểm tra hash kết quả
so với shared logic trước backup/ghi; kích thước hosts không làm tăng độ dài lệnh.
Windows chỉ mã hóa child script, tránh nhân đôi encoding ở wrapper UAC.
Hosts trên 1 MiB hoặc thêm mapping vào file không có newline cuối bị từ chối.
Backup không tự dùng để ghi đè các thay đổi hosts mới của người dùng. Main xác minh
membership sau mỗi thao tác. Nếu hosts entry bị xóa ngoài app khi proxy vẫn chạy,
**Restore hosts entry** sửa entry mà không bind lại listener; hủy quyền vẫn giữ
route đang chạy để có thể retry hoặc Disable.

Windows dùng PowerShell + UAC; macOS dùng osascript + Perl; Linux cần pkexec và
Perl. Browser/service-worker cache và trust store khác hệ thống vẫn cần người
dùng kiểm tra trực tiếp. Installer/signing và native macOS/Linux smoke nằm ngoài
kiểm chứng trên máy Windows này.

## Kiểm chứng ngày 2026-10-06

- `pnpm typecheck`: cả Node và renderer pass.
- `pnpm test -- --testTimeout=30000 --maxWorkers=1 --fileParallelism=false`:
  824 tests / 92 files pass. Coverage mới gồm validation, bảo toàn hosts bytes,
  cancelled Enable/Disable, metadata corrupt/crash recovery, serialized mutations,
  CA/leaf key preservation, exclusive publication rollback, trusted IPC,
  HTTP/TLS/SNI/WebSocket, upstream chỉ IPv6 và giới hạn pipelined requests.
- `pnpm build --logLevel warn`: pass. Cảnh báo chunk SQL/CodeMirror lớn vẫn còn;
  Local Domains là một chunk lazy riêng, không thêm dependency vào lockfile.
- `tests/local-domains-ui.smoke.mjs`: mock OS bridge trên production renderer,
  thêm/bật/tắt/open/copy/remove, modal cancellation/busy/focus, hosts bị gỡ ngoài
  app, HTTPS controls, orphaned hosts và cleanup khi settings corrupt; dark 1180
  và light 720 được chụp/kiểm tra không tràn layout.
- `tests/electron-local-domains.smoke.mjs`: production preload + main service
  thật trong hidden Electron profile riêng; HTTP redirect/TLS tới upstream chỉ
  bind `::1`, sender không tin cậy bị từ chối, route tồn tại với zero windows,
  reopen/cleanup/remove đóng listener và khôi phục memory-hosts fixture.
- `tests/tool-loading-mode-ui.smoke.mjs`: cả On demand mặc định và Preload pass
  với 40 interface; không mount tool, gọi privileged bridge, tạo worker hay chạy
  OCR/network khi chuẩn bị interface; lỗi một import không chặn tool khác.
- Thuật toán ghi Windows hosts thực thi trên file TEMP, kiểm tra backup bytes và
  từ chối stale hash. Windows ACL được kiểm tra thật trên directory TEMP, với
  mkcert cố ý không khả dụng để không thể tạo/cài CA.

Không sửa hosts thật, flush DNS thật hoặc cài/gỡ trust thật trong các bài kiểm
tra này. mkcert invocation được mock; TLS dùng public TEST-ONLY self-signed pair.
UAC và trust store end-to-end vẫn cần smoke trực tiếp. Adapter macOS/Linux mới
được kiểm tra command fixtures, chưa chạy native trên hai OS đó. Crash/kill thực
tế và cache của browser ngoài app cũng chưa được smoke tự động.
