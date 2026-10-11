# Hiro Steward

Trợ lý quản lý cuộc sống cá nhân trên iPhone: **Tiền · Thói quen · Công việc**.
Ghi bằng text hoặc voice qua **Telegram bot**, xem tổng quan trên **web app**, dữ liệu nằm trong **Google Sheet** của bạn.

```
iPhone ──► Telegram bot ──webhook──► Google Apps Script ──► Google Sheet
   └────► Web app (Safari, Add to Home Screen) ──┘   │
                                                     └──► Gemini API free (voice + câu tự do, tuỳ chọn)
```

## Vì sao chọn stack này

| Lựa chọn | Lý do |
|---|---|
| **Google Apps Script** làm backend | Miễn phí, không cần server/hosting. Vừa phục vụ web app (`doGet`), vừa nhận webhook Telegram (`doPost`), vừa đọc/ghi Sheet trực tiếp mà không phải cấu hình OAuth. |
| **Telegram bot** | Ghi nhanh nhất trên điện thoại: gõ “cafe 35k” hoặc giữ nút mic để gửi voice. |
| **Google Sheet** làm database | Xem/sửa tay dễ, tự vẽ chart, pivot. Đủ dùng cho vài chục nghìn dòng dữ liệu cá nhân. |
| **Gemini (free tier)** | Một API làm được cả hai việc: chép voice thành text và hiểu câu tự do. Không bắt buộc, vì đa số tin nhắn đã được parser quy tắc xử lý, nên rất ít khi tốn quota. |

## Cách dùng

**💸 Chi tiêu**: nhắn tự nhiên, bot tự tách số tiền và đoán danh mục:
- `cafe 35k` · `ăn trưa 45 nghìn` · `đổ xăng 80.000` · `mua giày 1tr2` · `tiền nhà 5tr` · `nhậu 3 lít`
- `hôm qua grab 120k` → ghi cho ngày hôm qua
- Số không có đơn vị mà nhỏ hơn 1000 thì hiểu là nghìn: `cafe 35` = 35.000đ
- `/thongke` (tháng) · `/thongke tuan` · `/undo` để xoá khoản vừa ghi

**🌱 Thói quen**
- `/habit_add Tập thể dục 4` (mục tiêu 4 lần/tuần) · `/habit_add Đọc sách`
- Làm xong chỉ cần nhắn tên thói quen, không cần dấu: `tap the duc`, `đọc sách 30 trang`
- `/habits`: chuỗi ngày liên tiếp (streak), số lần tuần này và lưới 7 ngày 🟩⬜

**🎯 Công việc**
- `/todo Gửi báo cáo mai #work` hoặc `todo gửi báo cáo 25/10`
- Hạn chót hiểu được: `hôm nay`, `mai`, `ngày mai`, `tuần sau`, `dd/mm`, `dd/mm/yyyy`. Dự án ghi bằng `#tên`
- `/tasks` · `/doing 3` · `/done 3` · `/reopen 3`

**🐟 Lead tracking (cho Account Manager)**: mỗi lead có giai đoạn, giá trị deal, **next action + hạn** và lần liên hệ cuối. Bot nhắc bạn mỗi sáng 8h.
- Thêm lead (ngăn cách bằng `|`, thứ tự tuỳ ý, thiếu mục nào cũng được):
  `/lead ABC Corp | 50tr | gửi báo giá | thứ 6 | @chị Mai` (cũng gõ được `lead ABC Corp | …` không cần dấu `/`)
- Sau mỗi cuộc gọi/họp: `/log abc đã gọi, khách quan tâm | gửi hợp đồng thứ 2 tuần sau`. Bot ghi lịch sử, cập nhật “liên hệ cuối” và đặt luôn next action mới
- `/next 3 họp demo 25/10` đặt next action · `/snooze 3 2` dời 2 ngày · `/stage 3 báo giá` đổi giai đoạn · `/won 3` · `/lost 3 giá cao`
- `/leads` danh sách (🔴 quá hạn · 🟠 hôm nay · ⚪ thiếu next action · 🟡 nguội · 🟢 ổn) · `/leads <tên>` lọc · `/pipeline` xem phễu và doanh số đã chốt tháng này
- Chỉ cần gõ **ID (3) hoặc một phần tên (abc)** để chọn lead
- Giai đoạn: Mới → Đã liên hệ → Họp/Demo → Báo giá → Đàm phán → Thắng/Thua (sửa trong `LEAD_STAGES`, `Config.gs`)
- **Nhắc nhở 8h sáng**: lead quá hạn, lead cần làm hôm nay, lead chưa có next action, lead ≥ 7 ngày chưa liên hệ (`STALE_DAYS`), cùng việc đến hạn và chi tiêu hôm qua. 21h tối có tổng kết ngày
- Hạn hiểu được: `hôm nay`, `mai`, `mốt`, `thứ 6` / `t6` / `cn` (lần sắp tới), `thứ 2 tuần sau`, `3 ngày nữa`, `sau 2 tuần`, `25/10`
- Dữ liệu nằm ở 2 tab **Leads** và **LeadLog** trong Google Sheet, bạn xem/sửa tay thoải mái

**Khác**: `/today` xem tóm tắt trong ngày · `/app` lấy link web app · gửi **voice** cho bất kỳ lệnh nào ở trên. 8h sáng bot nhắc lead và việc, 21h tối gửi tổng kết ngày. Sau khi cập nhật code, nhớ chạy lại `installTriggers` một lần để bật nhắc 8h.

## Cài đặt (khoảng 15 phút)

### 1. Tạo bot Telegram
Nhắn [@BotFather](https://t.me/BotFather) → `/newbot` → lưu lại **token**.

### 2. (Tuỳ chọn) Lấy Gemini API key
Vào [Google AI Studio](https://aistudio.google.com/apikey) → *Create API key*. Gói free là đủ dùng.

### 3. Tạo project Apps Script
**Cách A, copy-paste:** vào [script.google.com](https://script.google.com) → *New project*. Tạo các file giống trong `src/` (file `.gs` là *Script*, `Index.html` là *HTML*). Trong *Project Settings*, bật “Show appsscript.json” rồi dán nội dung `src/appsscript.json` vào.

**Cách B, dùng [clasp](https://github.com/google/clasp):**
```bash
npm i -g @google/clasp && clasp login
clasp create --type standalone --title "Hiro Steward" --rootDir src
clasp push
```

### 4. Khai báo Script Properties
*Project Settings → Script Properties*:

| Key | Giá trị |
|---|---|
| `TELEGRAM_TOKEN` | token từ BotFather |
| `GEMINI_API_KEY` | (tuỳ chọn) key AI Studio |
| `GEMINI_MODEL` | (tuỳ chọn) mặc định `gemini-2.5-flash`. Có thể đổi sang model free khác |
| `SHEET_ID` | (tuỳ chọn) ID một Sheet có sẵn. Để trống thì `setup()` sẽ tự tạo Sheet mới |

### 5. Chạy `setup`
Trong editor, chọn hàm `setup` → **Run** → cấp quyền. Xem *Execution log* để lấy link Sheet và `WEB_KEY`.

### 6. Deploy web app
**Deploy → New deployment → Web app**. *Execute as*: **Me**, *Who has access*: **Anyone**. Telegram cần quyền này mới gọi được webhook, còn dữ liệu đã được bảo vệ bằng secret/key, xem mục Bảo mật bên dưới.
Copy URL kết thúc bằng `/exec`, rồi thêm Script Property **`WEB_APP_URL`** = URL đó.

### 7. Nối Telegram
Chạy hàm `setWebhook`, rồi chạy `installTriggers` để bật nhắc nhở lúc 21h.
Mở bot và nhắn bất kỳ tin nào. Bot sẽ trả lời *Chat ID* của bạn. Thêm Script Property **`ALLOWED_CHAT_ID`** = số đó. Xong!

### 8. Đưa web app lên màn hình iPhone
Nhắn `/app` cho bot → mở link bằng Safari → nút Share → **Add to Home Screen**.

> ⚠️ Mỗi lần sửa code, vào **Deploy → Manage deployments → Edit → Version: New version** để URL `/exec` cũ nhận code mới. Nếu bạn tạo *deployment mới* thì URL sẽ đổi, và phải cập nhật `WEB_APP_URL` rồi chạy lại `setWebhook`.

## Email: AI đọc email (chỉ đọc) để gợi ý lead và lịch follow-up

AI quét email 14 ngày gần nhất và cho bạn biết: **đang có lead nào, next action là gì, nên follow-up khi nào, khách nào đang chờ bạn trả lời**. Kết quả hiện ở tab Lead (mục “📧 Từ email”), lệnh `/emails` và bản tin 8h sáng. Tính năng **tắt mặc định**.

### Vì sao “chỉ đọc” là thật
- `src/appsscript.json` chỉ xin quyền `gmail.readonly`. Quyền này do Google chặn ở tầng OAuth: dù code có lỗi hay bị email “nói dối”, token không thể gửi, sửa hay xoá email. Mọi lời gọi Gmail đi qua một hàm duy nhất (`gmailGet_`, chỉ dùng GET) và có test kiểm tra điều đó.
- Màn hình xin quyền của Google phải chỉ có “xem email”. Nếu thấy “gửi”, “quản lý” hay “xoá” thì **dừng lại** và báo mình.

### Dữ liệu đi đâu
| | |
|---|---|
| Nội dung email | Chỉ rời Apps Script để tới **Gemini API**, sau khi đã bỏ phần trích dẫn/chữ ký, che số thẻ/tài khoản dài, mật khẩu, OTP, và cắt ngắn. Bỏ qua email tự động (noreply), email nội bộ cùng tên miền, quảng cáo/mạng xã hội. |
| Google Sheet | Chỉ lưu **bản tóm tắt** (tab `EmailLeads`), không lưu nội dung email. |
| Web app | Chỉ nhận bản tóm tắt, không bao giờ nhận nội dung email. |
| Lead thật | AI chỉ **đề xuất**. Chỉ vào tab `Leads` khi bạn bấm “Thêm vào lead” (hoặc `/addmail`). |

**⚠️ Gemini miễn phí và dữ liệu email.** Theo [điều khoản Gemini API](https://ai.google.dev/gemini-api/terms), với gói miễn phí Google có thể dùng nội dung bạn gửi để cải tiến sản phẩm và người đánh giá có thể đọc, đồng thời khuyên không gửi thông tin nhạy cảm. Gói trả phí thì không dùng dữ liệu để cải tiến. Email khách hàng thường có thông tin bảo mật, nên khuyến nghị: tạo **một API key riêng thuộc project đã bật thanh toán** (chi phí rất nhỏ với model flash) và đặt vào `GEMINI_EMAIL_KEY`. Không đặt thì email dùng chung `GEMINI_API_KEY` (miễn phí). Hãy đối chiếu với thoả thuận bảo mật bạn có với khách hàng/công ty trước khi bật.

### Cách bật
1. Apps Script → ⚙️ Cài đặt dự án → bật “Hiển thị tệp kê khai appsscript.json” → thay nội dung bằng `src/appsscript.json` mới. Thay `Mã.gs` bằng `dist/Code.gs` mới (và `Index.html` nếu bạn dùng link `script.google.com`).
2. Cột trái, mục **Dịch vụ (Services)** → bấm **+** → chọn **Gmail API** → Thêm. Bước này làm Google bật Gmail API cho project (nếu bỏ qua sẽ gặp lỗi 403 “Gmail API has not been used in project … or it is disabled”). Nếu manifest đã có sẵn dịch vụ này thì bạn sẽ thấy “Gmail” trong danh sách, không cần thêm lần nữa.
3. Chọn hàm **`authorizeEmail`** → Chạy. Màn hình xin quyền có cảnh báo “Google chưa xác minh ứng dụng” (bình thường với script của chính bạn; `gmail.readonly` là quyền “hạn chế”). Kiểm tra danh sách quyền chỉ có xem email, rồi bấm Nâng cao → Tiếp tục. Nhật ký sẽ in ra **hộp thư script đang đọc**.
4. Script Properties: `EMAIL_ACCOUNT` = địa chỉ vừa in ra (xác nhận đúng hộp thư), `EMAIL_ENABLED` = `1`, và (khuyến nghị) `GEMINI_EMAIL_KEY`.
5. Chạy `installTriggers` lại 1 lần (thêm lượt quét 7h sáng), rồi **Triển khai → Phiên bản mới**.
6. Nhắn bot `/email`, đợi 1–3 phút, rồi `/emails`.

Tuỳ chọn (Script Properties): `EMAIL_DAYS` (mặc định 14), `EMAIL_MAX_THREADS` (40), `EMAIL_PER_RUN` (12 luồng/lượt, để không vượt hạn mức Gemini), `EMAIL_LABEL` (chỉ quét một nhãn Gmail, vd. `Khách hàng`), `EMAIL_SKIP_DOMAINS` (vd. `congtyban.com, vendor.com`), `EMAIL_ALIASES` (các địa chỉ gửi đi khác của bạn, để thư gửi từ alias không bị coi là thư của đối tác), `EMAIL_INCLUDE_INTERNAL=1` (quét cả email nội bộ), `GEMINI_EMAIL_MODEL`, `EMAIL_CONTEXT` (1–2 câu mô tả công việc để AI phân biệt khách hàng với thư chào hàng, vd. “Tôi là Account Manager của công ty X, bán dịch vụ phần mềm cho doanh nghiệp. Thư nhà cung cấp chào bán cho tôi không phải lead.”). Sau khi đặt `EMAIL_CONTEXT`, chạy `emailResetAnalysis` để xoá kết quả cũ rồi quét lại.

### Nhiều tài khoản Google: script sẽ đọc hộp thư nào?
Script đọc hộp thư của **tài khoản Google đã triển khai web app và tạo trigger**, không phải tài khoản bạn đang mở trong tab trình duyệt. Dấu hiệu: ảnh đại diện góc phải trên của trình soạn thảo Apps Script là tài khoản chủ project.
- Hàm `authorizeEmail` in ra hộp thư script đang đọc. Quét **chỉ chạy khi `EMAIL_ACCOUNT` khớp**; lệch thì dừng, chưa tải thư nào (tránh đọc nhầm hộp thư cá nhân thay vì hộp thư công việc).
- Muốn đọc hộp thư công việc `abc@congty.com`: tạo và triển khai project Apps Script **bằng chính tài khoản đó** (mở Apps Script trong cửa sổ đã đăng nhập tài khoản đó, hoặc dùng `script.google.com/u/1/...` theo thứ tự tài khoản). Khi đó Sheet dữ liệu lead cũng nằm trong Drive của tài khoản đó, nên hãy chắc chắn chính sách công ty cho phép.
- Script không thể đọc một hộp thư thứ hai bằng quyền của tài khoản khác. Muốn gom nhiều hộp thư thì phải triển khai riêng cho từng tài khoản.
- Chỉ đọc được hộp thư Gmail / Google Workspace; Outlook, email công ty không dùng Google thì không đọc được.

### Gặp lỗi?
| Lỗi | Cách xử lý |
|---|---|
| `Gmail API 403 ... has not been used in project ... or it is disabled` | Làm bước 2 ở trên (thêm dịch vụ Gmail API). Project mặc định của Apps Script tự bật API khi thêm dịch vụ. Nếu bạn đã gắn project Google Cloud riêng thì vào Cloud Console của project đó bật “Gmail API”. |
| `Script đang chạy bằng X nhưng EMAIL_ACCOUNT = Y` | Triển khai và cấp quyền bằng đúng tài khoản Y, hoặc sửa `EMAIL_ACCOUNT` nếu X mới là hộp thư bạn muốn. |
| Quyền hết hạn sau ~7 ngày | Có thể xảy ra nếu project dùng Google Cloud riêng ở trạng thái “Testing”. Chạy lại `authorizeEmail`, hoặc chuyển màn hình đồng ý OAuth sang “In production”. |

### Lệnh
`/email` quét ngay · `/emails` xem gợi ý · `/addmail 12` thêm vào lead (hoặc cập nhật lead đã có) · `/skipmail 12` bỏ qua. Luồng đã “bỏ qua” chỉ hiện lại nếu khách nhắn thêm và đang chờ bạn.

### Gỡ quyền
Vào [myaccount.google.com/permissions](https://myaccount.google.com/permissions) và xoá quyền của project Apps Script, hoặc đặt `EMAIL_ENABLED` về trống để dừng quét ngay.

### Giới hạn
AI có thể sai: luôn kiểm tra trước khi nhấn “Thêm vào lead”. Hạn follow-up là gợi ý dựa trên email cuối và quy tắc trong `emailPrompt_`. Sửa quy tắc đó cho khớp cách bạn làm việc. Tài khoản Google Workspace có thể bị quản trị viên chặn quyền này.

## Đưa web app lên GitHub Pages (tuỳ chọn, link đẹp + app toàn màn hình trên iPhone)

Mỗi tab có ô nhập riêng: **Lead** (gõ nhanh `tên | giá trị | việc | hạn` hoặc mở biểu mẫu), **Tiền** (`cafe 35k`, có nút xoá khoản vừa ghi), **Thói quen** (chạm dấu chân mỗi ngày), **Việc** (`gửi báo cáo mai #work`).

Giao diện nằm ở `docs/` (HTML tĩnh, theme mèo cam 🐱 + tiền 🪙, tự đổi sáng/tối theo iPhone), còn Apps Script chỉ làm API cho trang này gọi vào. Repo cần để **public** để dùng Pages miễn phí. Repo chỉ chứa code, còn key nằm trong Script Properties và trên điện thoại của bạn.

1. Dán lại `Code.gs` đã cập nhật vào Apps Script → **Deploy → Manage deployments → ✏️ → New version → Deploy** (URL giữ nguyên).
2. GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs` → Save**. Sau ~1 phút trang có tại `https://<user>.github.io/hiro-steward/`.
3. Thêm Script Property `PAGES_URL` = địa chỉ trang trên (không có dấu `/` thừa cũng được).
4. Nhắn `/app` cho bot. Bot trả về link có kèm `#key=…&api=…`; mở link đó **một lần** trong Safari để app tự lưu cấu hình. (Phần sau dấu `#` không bao giờ gửi lên GitHub.)
5. Share → **Add to Home Screen**. Nếu app trên màn hình chính hiện form nhập key (iOS tách bộ nhớ giữa Safari và app), dán `WEB_APP_URL` và `WEB_KEY` vào một lần.

Link cũ `…/exec?key=…` vẫn dùng được song song.

## Phát triển

```bash
npm run build   # sinh src/Index.html (bản trong Apps Script) và dist/Code.gs (1 file để dán) từ docs/index.html + src/*.gs
npm test        # test parser tiền/ngày và toàn bộ luồng lead (có Google Sheet giả)
```

- Giao diện chỉ sửa ở **`docs/index.html`**; `src/Index.html` và `dist/Code.gs` là file sinh tự động, đừng sửa tay.
- Mỗi lần sửa `src/*.gs`: chạy `npm run build`, dán lại **`dist/Code.gs`** vào Apps Script, rồi Deploy → New version.
- File `.gs` mới phải được thêm vào danh sách `order` trong `scripts/build.js`.

## Bảo mật
- Webhook chỉ nhận request có `?secret=WEBHOOK_SECRET`, vì Apps Script không đọc được header nên secret phải đi qua URL. Bot cũng chỉ trả lời đúng `ALLOWED_CHAT_ID`.
- Web app và mọi hàm `api_*` đều yêu cầu `WEB_KEY`. Đừng chia sẻ link `/app`. Nếu lộ link, đổi `WEB_KEY` trong Script Properties là xong.
- Telegram có thể gửi lại cùng một update, nên code chống ghi trùng bằng `update_id` (CacheService).

## Cấu trúc code
```
src/
  Code.gs       doGet / doPost, setup, setWebhook, triggers
  Router.gs     phân loại tin nhắn → tiền / thói quen / việc; các lệnh /…
  Finance.gs    parse số tiền kiểu VN (35k, 1tr2, 3 lít…), danh mục, thống kê
  Habits.gs     thói quen, streak, check theo ngày
  Leads.gs      lead tracking: giai đoạn, next action, nhắc nhở, phễu
  Email.gs      AI đọc Gmail chỉ-đọc, đề xuất lead/follow-up (tắt mặc định)
  Tasks.gs      công việc, hạn chót, #dự án
  AI.gs         Gemini: chép voice, phân loại câu tự do
  Telegram.gs   gọi Bot API, xử lý update
  WebApi.gs     các hàm web app gọi (có kiểm tra key)
  Config.gs     tên sheet, cột, từ khoá danh mục
  Utils.gs      Sheet / ngày tháng / format
  Index.html    web app mobile chạy ngay trong Apps Script
docs/             web app (nguồn duy nhất) cho GitHub Pages, gọi API qua fetch
dist/Code.gs      file sinh tự động: toàn bộ .gs gộp thành 1 để dán vào Apps Script
scripts/build.js  sinh src/Index.html và dist/Code.gs
test/             parse.test.js, leads.test.js, email.test.js, harness.js (Sheet giả)
```

Muốn thêm danh mục hoặc từ khoá thì sửa `CATEGORIES` trong `Config.gs`.
