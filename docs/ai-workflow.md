# Một chuẩn code chung cho các AI

## Bộ tài liệu trong repo

| File | Vai trò |
|---|---|
| `AGENTS.md` | Quy tắc chính: ý tưởng, boundary, safety, commands, cách kiểm tra |
| `docs/architecture.md` | Map Mermaid và index "nhiệm vụ → file" |
| `docs/review-2026-10-04.md` | Findings có bằng chứng và thứ tự sửa; snapshot có ngày |
| `CLAUDE.md` | Import `@AGENTS.md` cho Claude Code |
| `.github/copilot-instructions.md` | Entry point yêu cầu Copilot đọc cùng bộ quy tắc |

Markdown đọc được bằng mọi AI có quyền đọc repo. Mermaid là text nên AI hiểu được
quan hệ ngay cả khi editor chưa render sơ đồ. Mọi quy tắc chung chỉ sửa trong
AGENTS.md; khi đổi kiến trúc thì cập nhật map. Review là snapshot: đánh dấu finding
đã sửa bằng bằng chứng/test, không giả định tài liệu cũ còn đúng mãi.

## Dùng với từng công cụ

- **Codex và agent hỗ trợ AGENTS.md:** mở repo root; dùng entry point AGENTS.md.
  Đây là [định dạng mở](https://agents.md/), không phụ thuộc thư viện ứng dụng.
- **Claude Code:** CLAUDE.md import AGENTS.md theo
  [cơ chế import chính thức](https://code.claude.com/docs/en/memory#import-additional-files).
  Các bản hỗ trợ AGENTS.md trực tiếp cũng có thể đọc file gốc; kiểm tra context
  nạp bằng `/memory` để tránh giả định khác phiên bản.
- **GitHub Copilot:** adapter trong `.github/copilot-instructions.md` theo
  [repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions).
  Khả năng tự đọc linked files tùy client/mode; yêu cầu agent mở AGENTS.md khi bắt đầu.
- **AI/editor khác:** đính kèm AGENTS.md và architecture.md trong context. Không
  phải mọi extension đều tự tìm/read tất cả Markdown; xác minh bằng cách yêu cầu
  agent nêu boundary và file sẽ sửa trước khi làm task lớn.

Không cần cài package runtime hay thêm MCP để đạt mục tiêu này. VS Code có
[custom instructions tích hợp](https://code.visualstudio.com/docs/agent-customization/custom-instructions)
và có thể dùng Mermaid preview trong môi trường hỗ trợ. Repo hiện không cài thêm
extension hoặc chỉnh cấu hình editor toàn máy.

## Prompt mẫu cho một task

```text
Đọc AGENTS.md và docs/architecture.md; với vault/SSH/platform đọc thêm review.
Mục tiêu: [hành vi cần thêm/sửa].
Acceptance criteria: [input → output, lỗi, privacy, OS hỗ trợ].
Giữ nguyên thay đổi đang có của tôi. Trace các file liên quan rồi thực hiện.
Nếu có privileged IO, thêm shared contract, runtime validation ở main và bridge.
Chạy kiểm tra phù hợp, báo file đã sửa và giới hạn kiểm chứng.
```

## Cách tránh AI hiểu sai

1. Nêu hành vi và input/output trước tên thư viện muốn dùng.
2. Xác định dữ liệu ở RAM, disk plaintext, vault encrypted hay mạng.
3. Chốt OS/capability; không coi Windows build pass là macOS/Linux đã chạy được.
4. Với lỗi, test phản ánh hành vi sai trước rồi sửa nhỏ nhất có thể.
5. Với format lưu trữ, giữ version và recovery material; có plan migration khi cần.
6. Đọc diff, kết quả test và rủi ro còn lại; instructions là context giúp AI làm
   đúng, không thay thế validation, tests và review.
