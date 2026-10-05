# Mock API cho frontend

Mở **Network → Mock API**, dùng mẫu có sẵn hoặc **Add endpoint**. Mỗi endpoint gồm
method, path và danh sách response. Bấm **Edit** để sửa status, delay, header, body
và các điều kiện. **YAML** và form dùng cùng một cấu hình; **Export YAML** lưu file,
**Import YAML** kiểm tra cấu hình trước khi thay draft. Import không tự chạy server.
Form edits và cấu hình active xuất lại YAML chuẩn hóa, không giữ comment YAML;
file import gốc không bị sửa. Export hoặc Copy bản gốc trước khi sửa bằng form
nếu cần giữ comment.

**Try rules** nhập request giả để xem response nào thắng, không gửi HTTP. Sau khi
kiểm tra, bấm **Start server** và dùng base URL trong frontend. Mẫu mặc định dùng
`http://127.0.0.1:4010`. Nếu port đã có ứng dụng khác dùng, chọn port khác trong
Server settings rồi Apply. Server đang chạy dùng cấu hình tại thời điểm Start;
Stop rồi Start để áp dụng thay đổi.

```js
fetch('http://127.0.0.1:4010/api/users?role=admin', {
  headers: { Authorization: 'Bearer example' }
}).then(response => response.json())
```

Mẫu List users kiểm tra theo thứ tự:

1. Thiếu Authorization: 401.
2. Có `role=admin`: 200 với danh sách admin, delay 150 ms.
3. Có `page` lớn hơn 3: 200 với danh sách rỗng.
4. Không khớp các trường hợp trên: 200 với danh sách mặc định.

POST `/api/users` trả 422 nếu thiếu `/name` trong JSON body; nếu có, trả 201.
Các response là dữ liệu tĩnh được định nghĩa trong cấu hình, không phải database:
POST không thay đổi danh sách GET. Có thể thêm rule `x-scenario=error`, pagination,
empty state hoặc field validation để FE thử các trạng thái UI độc lập.

## Cấu trúc YAML v1

```yaml
version: 1
name: User detail API
port: 4010
cors:
  enabled: true
  origins:
    - http://localhost:*
    - http://127.0.0.1:*
endpoints:
  - id: user-detail
    name: User detail
    method: GET
    path: /api/users/:id
    responses:
      - id: unauthorized
        name: Missing token
        when:
          all:
            - source: header
              key: authorization
              operator: missing
        status: 401
        body: {error: Token is required}
      - id: disabled-user
        name: Disabled user
        when:
          all:
            - source: path
              key: id
              operator: equals
              value: "42"
          any:
            - source: query
              key: include
              operator: equals
              value: status
            - source: header
              key: x-scenario
              operator: equals
              value: disabled
        status: 200
        delayMs: 250
        headers: {X-Mock-Rule: disabled}
        body: {id: 42, name: Alex, active: false}
      - id: default
        name: User (fallback)
        status: 200
        bodyType: json
        body: {id: 1, name: Sam, active: true}
```

`version`, `name`, `port`, `cors`, `endpoints` bắt buộc. `id` ổn định gồm chữ/số,
gạch ngang hoặc underscore. Endpoint cần `id`, `name`, `method`, `path`, `responses`.
Response cần `id`, `name`, `status`; `headers`, `body`, `bodyType`, `delayMs` tùy chọn.
`bodyType` mặc định `json`; body vắng được trả JSON `null`. Với `bodyType: text`,
body phải là chuỗi. Header mặc định gồm Content-Type tương ứng, Cache-Control
no-store và X-Content-Type-Options nosniff. Có thể đổi Content-Type hoặc thêm header
nghiệp vụ. Các header điều khiển giao thức/CORS, nén và Set-Cookie bị từ chối.

Response cuối cùng phải là fallback, **không có `when`**. Các response trước đó
phải có ít nhất một điều kiện. Rule đầu tiên khớp sẽ thắng. `all` yêu cầu tất cả;
`any` yêu cầu ít nhất một. Nếu khai báo cả hai, cả hai nhóm phải thỏa mãn.
`bodyType` JSON và text đều hiển thị nguyên văn; không chạy script hay template.

## Điều kiện

| Trường | Cách dùng |
|---|---|
| `source: header` | `key: Authorization`; tên header không phân biệt hoa/thường |
| `source: query` | `key: role` cho `?role=admin`; nếu lặp key, chỉ cần một giá trị khớp |
| `source: path` | `key: id` cho `/users/:id`; giá trị được giải mã URL đúng một lần |
| `source: body` | JSON Pointer: `/name`, `/user/role`, `/items/0/id`; `key: ""` lấy root |
| `operator: exists` / `missing` | Không khai báo value; `null` vẫn là exists, missing là không tồn tại |
| `operator: equals` / `notEquals` | So sánh giá trị; field vắng không khớp cả hai |
| `operator: contains` | Chuỗi chứa value, phân biệt hoa/thường |
| `operator: gt/gte/lt/lte` | So sánh số; value phải là number, chuỗi request phải là số hợp lệ |

Header/query/path là chuỗi: với body JSON, equality giữ kiểu (`true` khác `"true"`).
Repeated query dùng ANY cho cả notEquals; ví dụ `role=admin&role=user` khớp
`notEquals: admin` vì có `user`. Muốn điều kiện đơn trị, FE nên gửi một value.
JSON Pointer dùng `~1` cho `/` trong tên field và `~0` cho `~`.

```yaml
when:
  all:
    - source: body
      key: /filters/active
      operator: equals
      value: true
    - source: body
      key: /pagination/page
      operator: gte
      value: 2
```

Method hỗ trợ GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. HEAD dùng GET nếu không
có HEAD riêng và không trả body. Status 204/205/304 cũng không trả body. Path matching
theo thứ tự endpoint; đặt `/users/me` trước `/users/:id`. Không normalize dấu `/`
cuối: `/users` khác `/users/`. Không dùng wildcard/regex. Không tìm thấy path trả
404; path có method khác trả 405. JSON body cần Content-Type application/json hoặc
media type `+json`; JSON sai trả 400. Body không phải JSON không có field JSON
để match. Không giải nén request.

## CORS và vòng đời

Server chỉ bind `127.0.0.1`, không mở LAN. Browser origin mặc định cho frontend
HTTP localhost và 127.0.0.1 trên mọi port; wildcard chỉ hỗ trợ hai dạng trên.
Origin khác cần nhập origin HTTP/HTTPS chính xác, không có path. Preflight OPTIONS
tự xử lý; frontend đọc được các response header đã cấu hình. Không cho credential
cookies. Nếu tắt CORS, request có Origin bị từ chối; curl/HTTP client không Origin
vẫn dùng được. HTTPS frontend có thể bị browser chặn HTTP mixed content. Host
không phải loopback đúng port bị từ chối để tránh DNS rebinding.

Đóng cửa sổ xuống tray vẫn giữ **server đã Start**. Tray **Mock API** cho biết port,
Copy base URL, Open hoặc Stop. Quit hủy listener, socket, delay; server không tự
khởi động khi mở app lần sau. Chưa Start thì không có listener/timer server và
không tạo renderer nền. Tool UI chỉ poll status mỗi 2 giây khi server chạy và cửa
sổ visible; rời tool dừng poll.

Cấu hình active và tối đa 100 activity entries nằm trong RAM. Activity chỉ gồm
method, registered route template, rule name, status, thời gian; không lưu URL,
path param, query, header hoặc request body. Stop xóa cấu hình và activity. Draft
trong view mất khi rời tool; mở lại khi server chạy sẽ lấy cấu hình active.
`network.mock-api` bị loại khỏi generic history/drafts. Export YAML là file
plaintext chứa response/header mẫu đã cấu hình, nên dùng dữ liệu mẫu khi chia sẻ.

Giới hạn: YAML và request/response body 1 MiB; 100 endpoints; 20 responses mỗi
endpoint; tối đa 20 điều kiện tổng cộng trong when, độ sâu JSON 20; 50 response headers;
delay 0–10 giây; 32 requests đồng thời, 64 sockets. Bounded đọc body 5 giây, header
5 giây, complete request 10 giây, idle socket 15 giây. YAML duplicate key, alias,
custom tag, field không hỗ trợ và prototype key đều bị từ chối. Server dùng
[Node HTTP](https://nodejs.org/api/http.html); parser dùng
[yaml](https://eemeli.org/yaml/) đã có trong dự án, không thêm framework server.

## Kiểm chứng

Domain tests bao phủ YAML/limits/rule ordering, query/body/path và CORS; server
tests gửi HTTP loopback thật để kiểm tra status/header/body/preflight, malformed
inputs, Stop/restart/port conflict và cancellation. UI smoke kiểm tra authoring,
Try rules, import/export và minimum window width. Native Electron smoke kiểm tra
production preload/IPC, tiếp tục phục vụ sau khi đóng renderer và Stop/Quit.
Vitest không tự chứng minh giao diện hoặc IPC Electron. Các kiểm tra native chạy
trên Windows; macOS/Linux cần smoke riêng trước phát hành.
