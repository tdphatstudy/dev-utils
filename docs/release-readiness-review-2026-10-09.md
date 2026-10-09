# DevFusion — review trước phát hành, 2026-10-09

Đây là kết quả review trước sửa. Các thay đổi và kiểm chứng sau đó nằm trong
[báo cáo sửa lỗi](release-fixes-2026-10-09.md).

## Kết luận

**Chưa nên phát hành thương mại rộng trên cả Windows/macOS/Linux.** Những điểm
cần ưu tiên là mất bản sửa chưa lưu trong Private Box, phụ thuộc WMIC đã bị loại
bỏ trên Windows mới, và toolchain tạo AppImage có advisory bảo mật ảnh hưởng
artifact. Sau đó xử lý SQL làm nghẽn renderer, playback media, cảm ứng và i18n.

Review working tree hiện tại, bao gồm các thay đổi chưa commit. Không sửa logic,
dependencies hoặc cấu hình ứng dụng. Các thay đổi của người dùng được giữ nguyên.
Đây là review code, chạy check và tái hiện có chọn lọc; không phải chứng nhận bảo
mật hay xác nhận mọi tính năng trên mọi thiết bị đều hoạt động.

P1 = cần xử lý trước khi phát hành cho nhóm người dùng bị ảnh hưởng. P2 = lỗi
hoặc chi phí đáng kể cần giải quyết trong đợt hoàn thiện sản phẩm. Mức severity
của advisory được ghi riêng, không đồng nhất với mức ưu tiên của ứng dụng.

## Findings

### 1. [P1] Chuyển trang làm mất bản sửa Private Box chưa lưu

Vị trí: `src/renderer/src/features/privatebox/PrivateBoxApp.tsx:38–43`,
`src/renderer/src/features/privatebox/DesktopDesktop.tsx:264–286`,
`src/renderer/src/hooks/useVaultDraftRecovery.tsx:18`.

Private Box không có route blocker/beforeunload cho editor đang dirty. Cleanup
khi unmount gọi clearAccess; hook recovery đăng ký snapshot cho sự kiện khóa
kho, không checkpoint khi điều hướng bình thường. Keep có luồng guard riêng,
không tự bảo vệ editor Private Box.

Tái hiện trên production renderer với bridge và dữ liệu chỉ trong RAM: mở file,
sửa nội dung, nhấn Home. Không có dialog, không gọi writeFile, clearAccess được
gọi một lần; bản sửa biến mất. beforeunload không bị chặn. Không có file người
dùng bị ghi hoặc xóa trong repro.

Sửa: dùng một dirty guard chung cho điều hướng, reload và native close; cung cấp
Save and continue / Discard / Keep editing. Save lỗi phải giữ bản sửa và chặn
rời trang. Không đưa plaintext vào settings hoặc generic drafts. Thêm regression
cho sidebar, Home, palette, Back, reload và close, kể cả save đang chạy.

### 2. [P1] Mở lại file đang sửa hoặc tạo file mới cũng xóa draft

Vị trí: `src/renderer/src/features/privatebox/DesktopDesktop.tsx:274–286`,
`:341–349`, `:360–366`.

openEntry chỉ hỏi discard khi đường dẫn mới khác file hiện tại. Mở lại chính
file đó đọc bản đã lưu rồi setDraft(file.content), setDirty(false). Tạo file mới
thay editor mà không chạy dirty guard; rename file đang mở cũng đọc lại nội dung.

Repro production renderer: sửa file, chọn chính tile đó rồi Enter → trở lại
Saved original, không dialog và không write. Sửa file rồi Ctrl+N → Create →
editor mới trống, không dialog và không write bản sửa cũ. Nhánh rename được xác
định từ source; chưa chạy riêng trong repro.

Sửa: mọi thao tác thay editor đi qua cùng guard; mở lại cùng file đang dirty
nên focus editor hiện tại. Rename cần bảo toàn draft hoặc yêu cầu giải quyết
dirty trước. Test cùng file, New, Rename và lỗi save.

### 3. [P1] Device vault/Keep không khởi tạo trên Windows thiếu WMIC

Vị trí: `src/main/secret-box/machine-id.ts:69–78`,
`src/main/secret-box/device-secret.ts:76–88`, `src/main/secret-box/vault.ts:475`.

Windows hardware adapter chỉ gọi wmic bốn lần. Lệnh thiếu/lỗi trả chuỗi rỗng;
setup chỉ fallback sang legacy secret đã có. Cài mới không có legacy material
sẽ không tạo được device vault/default Secret Box, ảnh hưởng Keep và Save to Box.

Gọi resolveHardwareDeviceSecret thực tế trên host Windows trong lần review trả
DEVICE_FINGERPRINT_UNAVAILABLE. Không in hardware ID và không sửa vault thật.
Microsoft xác nhận WMIC bị loại bỏ khỏi Windows 11 24H2 trở lên từ tháng 8/2026.
[Nguồn Microsoft](https://learn.microsoft.com/en-us/windows/whats-new/removed-features).

Sửa: adapter PowerShell/CIM có output được validate, timeout và windowsHide;
giữ cùng bộ ID và normalization để tương thích khóa cũ. Giữ nguyên các candidate
legacy/cache, không thay salt hay derive algorithm ngầm. Test Windows không
WMIC, dữ liệu firmware generic, quyền hạn chế và mở lại vault cũ.

### 4. [P1 cho Linux AppImage] Builder hiện tại có lỗi search path trong artifact

Vị trí: `package.json:88`, `pnpm-lock.yaml:1358`, `electron-builder.yml:85`.

Lockfile dùng app-builder-lib 25.1.8 và cấu hình phát hành có AppImage. Advisory
GHSA-7g7r-gx96-252g, severity High, ảnh hưởng bản <26.15.0: AppRun có thể thêm
current directory vào LD_LIBRARY_PATH khi biến ban đầu rỗng. Người có quyền ghi
vào thư mục chạy AppImage có thể đặt shared library để code được load vào app.
Đây là trường hợp dev dependency làm artifact runtime bị ảnh hưởng, dù app
không dùng auto-updater. [Advisory của maintainer](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-7g7r-gx96-252g).

Đã xác minh phiên bản, target và advisory; chưa build/tái hiện exploit AppImage
trên Linux trong review này. Sửa toolchain bằng phiên bản đã vá, rebuild trên
Linux và kiểm tra AppRun/artifact. Chạy lại bytecode, fuse, ASAR, packaging và
signing checks khi nâng builder; không chỉ override dependency rồi coi là xong.

### 5. [P2] SQL hợp lệ làm nghẽn renderer nhiều giây

Vị trí: `src/renderer/src/features/tools/sql/SqlStudio.tsx:80–83`, `:110`,
`src/shared/sql/index.ts:81`, `:122`.

Validation và formatting chạy đồng bộ trong useMemo mỗi khi input/options đổi.
Format action còn tính lại. File import cho phép tới 8 MiB. Repro với parser và
formatter đã cài, options giống code ứng dụng:

| Input SQL hợp lệ | Validate | Format | Tổng | RSS Node ở cuối lần đo |
| --- | ---: | ---: | ---: | ---: |
| 39 KB / 1.000 SELECT | 366 ms | 368 ms | 734 ms | 87 MiB |
| 195 KB / 5.000 SELECT | 725 ms | 818 ms | 1.543 ms | 199 MiB |
| 780 KB / 20.000 SELECT | 1.251 ms | 7.055 ms | 8.307 ms | 956 MiB |

Đây là phép đo xử lý trong Node, không phải RAM Electron hay bằng chứng crash.
Đường UI gọi đồng bộ cùng logic nên renderer không phản hồi trong lúc xử lý.
Production vendor-sql là 2.903,22 kB; chunk lazy trì hoãn tải nhưng không giải
quyết chi phí xử lý khi tool đã mở.

Sửa: SQL worker có cancellation, deadline, revision chống stale result và giới
hạn độ phức tạp; debounce validation, chỉ format khi cần, reuse kết quả. Test
Cancel, sửa input trong lúc chạy, timeout và retry trên SQL lớn.

### 6. [P2] CSP chặn audio/video của Private Box

Vị trí: `src/renderer/index.html:7`,
`src/renderer/src/features/privatebox/editors/MediaViewer.tsx:34`, `:84`, `:97`.

Viewer tạo blob URL nhưng CSP thiếu media-src; default-src 'self' chặn blob
media. Production transform chỉ thay connect-src, không sửa phần này.

Repro headless Edge với đúng policy production và PCM WAV hợp lệ: media error=4,
readyState=0, securitypolicyviolation media-src/blob. Cùng WAV, chỉ thêm
media-src 'self' blob: → loadedmetadata, readyState=1, không CSP violation.
Repro tách vấn đề policy khỏi codec; native vault playback vẫn cần smoke riêng.

Sửa: directive media-src hẹp nói trên, giữ nguyên sandbox/CSP còn lại; test audio
và video codec được hỗ trợ qua file URL trong packaged Electron.

### 7. [P2] OCR crop sai khi có nhiều pointer

Vị trí: `resources/ocr-helper.js:34–47`.

Mọi pointerdown ghi đè start; move/up/cancel không kiểm tra pointer đang sở hữu
gesture. VM fixture chạy script thật: pointer 1 down(100,100), pointer 2
down(500,500), pointer 1 up(200,200), viewport 1.000×1.000. Rect mong đợi
{x:.1,y:.1,width:.1,height:.1}; thực tế {x:.2,y:.2,width:.3,height:.3}.

Có thể OCR nhầm vùng khi ngón thứ hai hoặc lòng bàn tay chạm lúc dùng bút.
Chưa test thiết bị cảm ứng thật. Sửa: activePointerId, chỉ nhận primary pointer
khi chưa có gesture, bỏ qua pointer khác; reset đúng pointer khi cancel/up/lost
capture. Test mouse, single touch, multi-touch và pen + palm.

### 8. [P2] Chọn ngôn ngữ chưa dịch toàn bộ workflow

Vị trí: `src/renderer/src/features/tools/convert/ImageConvert.tsx:225`,
`:269–277`, `src/renderer/src/features/privatebox/DesktopDesktop.tsx:640–647`,
`tests/i18n.test.ts:27–38`.

Repro production renderer ở locale vi: tên Image Convert được dịch, nhưng Choose
image, Resize, Percent, Max box, Exact và các chỉ dẫn vẫn tiếng Anh. Private Box
và media editor cũng có JSX tiếng Anh trực tiếp. Lookup không tự dịch DOM.
Test catalog đầy đủ chỉ chứng minh các message đã đăng ký có đủ cột/placeholders;
i18n smoke qua không chứng minh mọi label/workflow đều được dịch.

Sửa: kiểm kê text hiển thị, helper HTML/JS, dialog, aria-label, validation và
metadata; đi qua cùng hệ thống i18n. Dùng glossary thống nhất, plural theo locale,
giữ technical identifiers như JSON/HTTP/SSH. Test thao tác thật ở vi, ngôn ngữ
dài, CJK và Arabic RTL, không chỉ đổi selector. Cần người thông thạo từng ngôn
ngữ review copy; completeness check không xác nhận chất lượng bản dịch.

### 9. [P2] Clipboard không đổi vẫn đọc và hash toàn payload mỗi 500 ms

Vị trí: `src/main/clipboard/service.ts:13`, `:65`, `:106–113`,
`src/main/clipboard/native.ts:10`, `:23–29`.

So sánh unchanged chỉ xảy ra sau native read, PNG→base64 và JSON stringify/hash.
Khi capture bật, chi phí này tiếp tục ở main dù chỉ còn tray. Synthetic benchmark
24 lần với payload hợp lệ sát giới hạn: text 256 KiB + HTML 256 KiB + PNG 4 MiB,
serialized 5,83 MiB; hash median 26,9 ms, p95 29,4 ms/poll. Khoảng 54 ms CPU/giây
chỉ cho hash, chưa tính native IO/encode; không phải CPU toàn app đã đo.

Sửa: kiểm tra change marker/sequence trước khi lấy payload ở OS có hỗ trợ,
polling thích ứng, dừng timer khi paused/disabled/locked. Giữ privacy checks,
giới hạn payload, deadline và chính sách auto-capture hiện tại.

### 10. [P2] Dependency security chưa có gate trong CI

Vị trí: `pnpm-lock.yaml:2678`, `:2685`, `.github/workflows/quality.yml:29–41`.

pnpm audit --prod báo 3 Moderate trên react-router/react-router-dom 6.30.4.
GHSA-jjmj-jmhj-qwj2 có bản vá v6.30.6; GHSA-wrjc-x8rr-h8h6 khai báo bản vá
v7.18.0. GHSA-337j-9hxr-rhxg yêu cầu SSR hydration, trong khi app dùng createRoot
và createHashRouter, không có đường SSR đó. Các navigation target đã kiểm tra
là constant/ID được validate; native navigation guard và CSP đang có. **Chưa
chứng minh exploit router trong DevFusion.**

Audit toàn cây báo 21 Moderate / 39 High / 3 Critical (số đếm do audit trả về,
không phải từng lỗ hổng độc lập trong app runtime). Critical nằm ở tar qua builder
và tinypool qua Vitest. Những đường build/test cần phân tích riêng; không coi cả
63 cảnh báo là 63 cách hack app. AppImage đã tách thành finding 4 vì ảnh hưởng
artifact được maintainer xác nhận.

Sửa: dependency scan cho cả shipped bundle và toolchain, phân loại reachability,
ghi ngoại lệ có lý do/thời hạn; nâng theo từng nhóm và chạy compatibility checks.
Không dùng audit --fix --force hoặc nâng major hàng loạt. Nâng router cần test
route blockers, hash navigation và lưu bản sửa. [Router redirect advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-jjmj-jmhj-qwj2),
[backslash advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6),
[SSR advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg).

### 11. [P2] Ctrl+Enter trong Environment Compare chèn dòng thay vì chạy

Vị trí: `src/renderer/src/features/tools/security/EnvironmentCompare.tsx:28`,
`src/renderer/src/components/ui/ToolTextInput.tsx:5`,
`src/renderer/src/shortcuts/useShortcuts.ts:54`,
`src/renderer/src/components/ui/CodeEditor.tsx:178–184`.

Environment Compare đăng ký Run ở window listener, nhưng ToolTextInput không
truyền onRun xuống CodeEditor. CodeMirror dùng Mod-Enter cho insertBlankLine và
consume event; window listener bỏ qua defaultPrevented. Exact enterprise smoke
và diagnostic repro đều cho thấy Target thêm dòng trống, không có results.
Compare bằng nút vẫn hoạt động ở 1180×760 và 720×500.

Sửa: truyền onRun={compare} vào cả hai editor qua ToolTextInput để handler ưu
tiên hiện có của CodeEditor sở hữu shortcut. Giữ guard modal/focus và shortcut
overrides. Test default/custom binding, focus từng input và modal đang mở;
không bỏ defaultPrevented guard toàn cục để làm test qua.

## Đánh giá theo 7 mục tiêu

| Mục tiêu | Nền tảng hiện có | Việc cần làm trước phát hành |
| --- | --- | --- |
| Source clean/patterns | Main/preload/renderer/shared tách rõ; typed bridge, strict TS, domain tests | Guard thay editor thống nhất; worker cho SQL; platform adapters; formatter/lint và dependency boundary checks chưa có gate rõ trong quality workflow |
| Security/chống lạm dụng | Sandbox, context isolation, web security, sender/payload validation, navigation restrictions, vault/session guards, bytecode/fuses/ASAR checks | Findings 4/10; ký và xác minh artifact thật; threat model theo dữ liệu/đặc quyền, không hứa chống hack/crack tuyệt đối |
| Stable trên desktop | Crash recovery, session invalidation, capture hotplug cleanup, time/size bounds | Findings 1/2/3/5/7; QA hardware/OS thực và installer lifecycle |
| Tính năng đúng | Suite domain/IPC lớn; native smoke có giới hạn | Dirty flows, media playback, fresh Windows; matrix input/round-trip/cancel/retry cho mỗi tool |
| UI/UX | Loading/error states, palette, keyboard, responsive panes, reduced motion | Không mất draft; thao tác cảm ứng; QA focus, zoom, contrast và recovery flows |
| Copy/i18n chuyên nghiệp | 13 locale, catalog contracts, locale smoke | Finding 8; glossary, plural, RTL/CJK và review biên tập bằng người thông thạo ngôn ngữ |
| Performance | On demand mặc định; worker YAML/Regex/analysis; OCR/PDF renderer tạm; memory draft caps | Findings 5/9; đo idle/cold/warm/peak memory và leak theo chu kỳ trên app đóng gói |

Clean source nên ưu tiên tên rõ, trách nhiệm nhỏ và invariant có test. Nếu chọn
quy ước không comment, các lý do bảo mật/format compatibility cần chuyển sang
tài liệu hoặc test có tên rõ; xóa comment đơn thuần không cải thiện tính đúng.
Hiện một số comment hardware recovery còn mạnh hơn bảo đảm thực tế; cần sửa copy
đó, không dùng nó làm chứng cứ tương thích.

## Bảo vệ thương mại và dữ liệu

verifyOfflineLicense hiện là module nền tảng, chưa được main runtime gọi; không
có activation UI hoặc entitlement enforcement. Đây là việc cần thiết kế nếu bán
theo license/premium, không phải bằng chứng license đã bị bypass.

Ship public issuer keys trong main, giữ private keys ngoài repo/artifact; verify
envelope có chữ ký khi import/startup và enforce quyền tại privileged operation.
Không khóa người dùng khỏi vault, recovery hoặc xuất dữ liệu của họ khi license
lỗi. Chưa chốt policy trả phí nên không tự thêm machine binding/expiry/server.

Bytecode/minify/fuses nâng chi phí sửa và kiểm tra integrity; chúng không xác
thực một executable unsigned thay thế và không ngăn tuyệt đối người kiểm soát
máy/binary patch kiểm tra offline. Signed profiles đã tồn tại, nhưng review này
không có chứng chỉ hay artifact ký thật. Linux không có cùng runtime ASAR
integrity enforcement như Windows/macOS. [Electron integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity),
[Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

## Kiểm tra đã chạy

| Check | Kết quả |
| --- | --- |
| pnpm version | 10.33.4 đúng packageManager; host Node 20.19.5, CI cấu hình Node 22 |
| pnpm test | Lần đầu: 123/125 files qua, 1.106/1.108 tests; crypto timeout 5s và Windows process-name lookup lỗi dưới tải |
| Hai file lỗi chạy riêng, maxWorkers=2 | 8/8 tests qua; không đổi timeout/code để làm xanh |
| pnpm test --maxWorkers=4 | 125/125 files, 1.108/1.108 tests qua; cùng concurrency quality CI |
| pnpm typecheck | Node và web qua |
| pnpm build | Qua; warning vendor-sql 2.903,22 kB >900 kB |
| pnpm test:electron:security | Qua trên Windows; fixture profile/vault tạm, production renderer/preload; chưa phải signed installer smoke |
| pnpm test:ui:i18n | Qua các luồng đã có: 13 locale, System/RTL, persisted reload, input preservation, worker; không bao phủ mọi label |
| pnpm test:ui:enterprise | Thất bại tại enterprise-ui.smoke.mjs:59; đã tái hiện và xác định Ctrl+Enter bị CodeMirror consume, finding 11; không tính là qua |
| node tests/vault-lock-ui.smoke.mjs | Chạy riêng và qua sau khi enterprise chain dừng |
| node tests/advanced-tools-ui.smoke.mjs | Chạy riêng và qua |
| pnpm test:ui:security-testing | Qua consent gates, worker, Stop/cancellation và privacy của các luồng fixture |
| pnpm audit --prod / audit toàn cây | 3 Moderate production; toàn cây 21 Moderate / 39 High / 3 Critical, có phân loại ở findings 4/10 |
| Focused repro | Dirty navigation/editor replacement; thiếu WMIC; media CSP; SQL timings; clipboard hash cost; OCR multi-pointer; locale vi còn English |
| Signed installer, macOS/Linux native, physical hardware | Chưa chạy trong review này |

Native security fixture in một số lỗi do cố ý thử IPC bị từ chối và thiếu handler
theme trong fixture; assertions qua. Không suy ra mọi IPC/UI/OS adapter đã được
xác minh từ smoke đó. Repro dùng dữ liệu fixture/RAM hoặc file tạm, không sửa
system hosts, clipboard người dùng hoặc vault thật.

## Thứ tự xử lý và tiêu chí hoàn tất

1. Sửa hai đường mất draft; test dirty → route/editor/close, retry save và session
   switch. Sửa Windows hardware adapter và chứng minh tương thích vault đã có.
2. Vá builder/AppImage và dependencies theo reachability; chạy lại packaging,
   security và signed artifact verification. Sửa shortcut để enterprise UI gate
   đang đỏ chạy qua đầy đủ.
3. Worker SQL, media CSP, OCR pointer ownership, clipboard change detection.
4. Hoàn thiện i18n toàn workflow, glossary và QA bởi người thông thạo ngôn ngữ;
   kiểm tra bàn phím, touch/pen, screen reader, 200% zoom và RTL.
5. Chạy release matrix trên revision cụ thể và artifact thật; lưu version/hash,
   kết quả QA, bản cài rollback và backup dữ liệu mã hóa đã thử khôi phục.

Hardware QA tối thiểu: một và nhiều màn hình, mixed DPI 100/150/200%, tọa độ âm,
portrait, đổi màn hình chính/hotplug khi picker mở; touch/pen/palm; sleep/resume,
screen lock, remote desktop, capture denied; GPU/driver và VM. Software QA:
antivirus/EDR, policy chặn subprocess/screen capture, clipboard manager khác,
mkcert/OpenSSH thiếu, filesystem ACL khác, disk full/read-only và Unicode paths.
Các trường hợp chưa chạy là khoảng trống QA, không tự chứng minh crash.

Budget đề xuất, cần đo trên máy tham chiếu rồi chốt: tray idle CPU trung bình
<0,5% trong 10 phút; tray không giữ renderer khi không có widget/job; cold tool
open p95 <1 giây, warm <200 ms; parsing tự động không tạo task UI >100 ms; sau
100 vòng mở/đóng tool/OCR không tăng worker/renderer/listener hay RAM liên tục.
Đo baseline và peak riêng cho OCR/SQL/capture; chưa có cam kết RAM toàn app từ
review này. Giữ on demand mặc định; dynamic imports đã tải vẫn được cache tới
khi renderer đóng/reload, không tự unload khỏi RAM.
