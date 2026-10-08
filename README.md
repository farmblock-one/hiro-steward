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

**Khác**: `/today` xem tóm tắt trong ngày · `/app` lấy link web app · gửi **voice** cho bất kỳ lệnh nào ở trên. Mỗi tối 21h bot tự gửi tổng kết ngày.

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
  Tasks.gs      công việc, hạn chót, #dự án
  AI.gs         Gemini: chép voice, phân loại câu tự do
  Telegram.gs   gọi Bot API, xử lý update
  WebApi.gs     các hàm web app gọi (có kiểm tra key)
  Config.gs     tên sheet, cột, từ khoá danh mục
  Utils.gs      Sheet / ngày tháng / format
  Index.html    web app mobile (Tiền · Thói quen · Việc)
test/parse.test.js   test parser (node test/parse.test.js)
```

Muốn thêm danh mục hoặc từ khoá thì sửa `CATEGORIES` trong `Config.gs`.
