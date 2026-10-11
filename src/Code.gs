/**
 * Entry points.
 *  - doPost: webhook Telegram (URL web app + ?secret=...)
 *  - doGet:  web app cho iPhone (URL web app + ?key=...)
 *  - setup / setWebhook / installTriggers: chạy tay 1 lần trong Apps Script editor.
 */

function doPost(e) {
  try {
    if (!e || !e.postData) return ok_();
    // API cho web app trên GitHub Pages: body JSON {key, fn, args}, không có ?secret=
    if (!e.parameter.secret) return apiResponse_(e.postData.contents);
    // Webhook Telegram. Apps Script không đọc được header nên secret đi qua query string.
    if (e.parameter.secret !== prop_('WEBHOOK_SECRET')) return ok_();
    const update = JSON.parse(e.postData.contents);
    // Telegram có thể gửi lại cùng 1 update -> chống ghi trùng.
    const cache = CacheService.getScriptCache();
    const key = 'upd_' + update.update_id;
    if (cache.get(key)) return ok_();
    cache.put(key, '1', 21600);
    try { handleUpdate_(update); }
    catch (err) { console.error(err && err.stack || err); notifyHandlerError_(update, err); }
  } catch (err) {
    console.error(err && err.stack || err);
  }
  return ok_();
}

/** Lệnh bị lỗi thì báo thẳng cho bạn trong Telegram, không để bot im lặng. Chỉ báo cho đúng chat được phép. */
function notifyHandlerError_(update, err) {
  try {
    const msg = update && (update.message || update.edited_message);
    const chatId = msg && msg.chat ? String(msg.chat.id) : '';
    if (chatId && chatId === (prop_('ALLOWED_CHAT_ID') || '').trim()) {
      send_(chatId, '⚠️ Bot gặp lỗi khi xử lý lệnh này: ' + String(err && err.message || err).slice(0, 250) +
        '\nNếu lỗi nhắc tới quyền (authorization/permission), chạy một hàm bất kỳ trong trình soạn thảo để cấp quyền, rồi Triển khai → Phiên bản mới.');
    }
  } catch (e) { console.error(e); }
}

function ok_() {
  return ContentService.createTextOutput('ok');
}

function doGet(e) {
  if (!e || !e.parameter || !prop_('WEB_KEY') || e.parameter.key !== prop_('WEB_KEY')) {
    return HtmlService.createHtmlOutput('<h3>401 · Thiếu hoặc sai key</h3>');
  }
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.webKey = e.parameter.key;
  return tpl.evaluate()
    .setTitle('Hiro Steward')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------- Chạy tay 1 lần ----------

/** Tạo spreadsheet + các sheet, sinh secret. Chạy đầu tiên. */
function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SHEETS).forEach(k => sheet_(SHEETS[k]));
  const blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
  sheet_(SHEETS.EXPENSES).getRange('C:C').setNumberFormat('#,##0');
  if (!prop_('WEBHOOK_SECRET')) setProp_('WEBHOOK_SECRET', Utilities.getUuid().replace(/-/g, ''));
  if (!prop_('WEB_KEY')) setProp_('WEB_KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  console.log('Spreadsheet: ' + ss.getUrl());
  console.log('WEB_KEY: ' + prop_('WEB_KEY'));
}

function setBotCommands_() {
  tg_('setMyCommands', { commands: [
    { command: 'today', description: 'Tóm tắt hôm nay' },
    { command: 'thongke', description: 'Chi tiêu tháng này (thêm "tuan" cho tuần)' },
    { command: 'undo', description: 'Xoá khoản chi vừa ghi' },
    { command: 'habits', description: 'Xem thói quen & chuỗi ngày' },
    { command: 'habit_add', description: 'Thêm thói quen: /habit_add Đọc sách 5' },
    { command: 'todo', description: 'Thêm việc: /todo Gửi báo cáo mai #work' },
    { command: 'tasks', description: 'Danh sách việc đang mở' },
    { command: 'leads', description: 'Danh sách lead đang mở' },
    { command: 'lead', description: 'Thêm lead: /lead ABC | 50tr | gửi báo giá | thứ 6' },
    { command: 'log', description: 'Ghi liên hệ: /log 3 đã gọi | gửi HĐ mai' },
    { command: 'next', description: 'Đặt next action: /next 3 họp demo 25/10' },
    { command: 'pipeline', description: 'Phễu bán hàng' },
    { command: 'emails', description: 'Gợi ý lead/follow-up từ email' },
    { command: 'email', description: 'Quét email ngay (chỉ đọc)' },
    { command: 'done', description: 'Hoàn thành việc: /done 3' },
    { command: 'app', description: 'Mở web app' },
    { command: 'help', description: 'Hướng dẫn' },
  ] });
}

/** Đăng ký webhook với Telegram. Chạy sau khi Deploy web app và đặt WEB_APP_URL. */
function setWebhook() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pollTelegram').forEach(t => ScriptApp.deleteTrigger(t));
  setProp_('TELEGRAM_MODE', 'webhook');
  const r = tg_('setWebhook', { url: webhookUrl_(), drop_pending_updates: true, allowed_updates: ['message'] });
  setBotCommands_();
  console.log(JSON.stringify(r));
  const wi = tg_('getWebhookInfo');
  if (wi.result && wi.result.url) wi.result.url = wi.result.url.replace(/(secret=).*/, '$1***đã-ẩn'); // đừng để lộ secret trong nhật ký/ảnh chụp
  console.log(JSON.stringify(wi));
}

/** Nhắc nhở: 8h sáng (lead, việc) và 21h tối (tổng kết ngày). Chạy lại được nhiều lần. */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['eveningReminder', 'morningReminder', 'dailyEmailScan'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyEmailScan').timeBased().everyDays(1).atHour(7).inTimezone(TZ).create(); // chỉ chạy khi EMAIL_ENABLED = 1
  ScriptApp.newTrigger('morningReminder').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  ScriptApp.newTrigger('eveningReminder').timeBased().everyDays(1).atHour(21).inTimezone(TZ).create();
}

function morningReminder() {
  const chatId = (prop_('ALLOWED_CHAT_ID') || '').trim();
  if (chatId) send_(chatId, morningBrief_());
}

function eveningReminder() {
  const chatId = (prop_('ALLOWED_CHAT_ID') || '').trim();
  if (chatId) send_(chatId, '🌙 Tổng kết ngày\n\n' + dailyDigest_());
}

/** Kiểm tra cấu hình khi bot không trả lời. Chạy tay rồi xem Nhật ký thực thi. */
function diagnose() {
  const p = PropertiesService.getScriptProperties().getProperties();
  ['TELEGRAM_TOKEN', 'ALLOWED_CHAT_ID', 'WEB_APP_URL', 'WEBHOOK_SECRET', 'WEB_KEY', 'SHEET_ID', 'GEMINI_API_KEY', 'GEMINI_EMAIL_KEY', 'EMAIL_ENABLED', 'EMAIL_ACCOUNT'].forEach(k => {
    const shown = k === 'ALLOWED_CHAT_ID' || k === 'WEB_APP_URL' || k === 'EMAIL_ENABLED' || k === 'EMAIL_ACCOUNT' ? JSON.stringify(p[k]) : 'đã đặt';
    console.log(`${k}: ${p[k] ? shown : '❌ CHƯA ĐẶT'}`);
  });
  if (!p.TELEGRAM_TOKEN) return;
  const me = tg_('getMe');
  console.log(me.ok ? `Bot: @${me.result.username}` : '❌ TELEGRAM_TOKEN sai');
  console.log('Chế độ nhận tin Telegram: ' + (p.TELEGRAM_MODE === 'poll' ? 'POLLING (script tự hỏi Telegram mỗi phút)' : 'WEBHOOK'));
  if (p.TELEGRAM_MODE === 'poll') console.log(ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'pollTelegram') ? '✅ Trigger pollTelegram đang bật.' : '❌ Thiếu trigger pollTelegram. Chạy lại usePolling.');
  const info = tg_('getWebhookInfo').result || {};
  console.log(`Webhook URL: ${info.url ? info.url.replace(/(secret=).*/, '$1***đã-ẩn') : '❌ CHƯA ĐẶT (chạy setWebhook)'}`);
  console.log(`Tin đang chờ: ${info.pending_update_count}`);
  if (info.last_error_message) {
    const ago = info.last_error_date ? Math.round((Date.now() / 1000 - info.last_error_date) / 60) : null;
    console.log(`Lỗi gần nhất từ Telegram: ${info.last_error_message}` + (ago != null ? ` (cách đây ${ago} phút)` : ''));
  }
  const registered = String(info.url || '').split('?')[0], configured = String(p.WEB_APP_URL || '').trim();
  if (p.TELEGRAM_MODE !== 'poll' && registered && configured) console.log(registered === configured ? '✅ Telegram đang trỏ đúng WEB_APP_URL.' : '❌ Telegram đang trỏ tới địa chỉ KHÁC WEB_APP_URL. Chạy lại setWebhook.');
  if (p.ALLOWED_CHAT_ID) {
    const r = tg_('sendMessage', { chat_id: p.ALLOWED_CHAT_ID.trim(), text: '🔧 Test từ diagnose(): bot gửi được tin cho bạn.' });
    console.log(r.ok ? 'Gửi tin thử: OK' : `❌ Gửi tin thử thất bại: ${r.description}`);
  }
}

/** Chạy thử các lệnh email ngay trong trình soạn thảo. Nếu lệnh lỗi, nhật ký in ra chính xác dòng lỗi (bot thì chỉ im lặng). */
function testCommands() {
  ['/emails', '/email'].forEach(c => {
    try { console.log(c + ' → ' + String(handleCommand_(c)).slice(0, 600)); }
    catch (e) { console.log(c + ' ❌ LỖI: ' + (e && e.stack || e)); }
  });
}

/** Gửi thử 3 tin tới Telegram và in phản hồi của Telegram (OK hay lý do từ chối). Dùng khi bot “chạy mà không trả lời”. */
function testSend() {
  const chatId = (prop_('ALLOWED_CHAT_ID') || '').trim();
  [['nội dung /emails', handleCommand_('/emails')], ['tin báo quét email', '📧 Mình sẽ quét email chỉ-đọc trong nền, xong sẽ báo kết quả.'], ['tin không emoji', 'Test không emoji']].forEach(x => {
    const r = tg_('sendMessage', { chat_id: chatId, text: x[1], disable_web_page_preview: true });
    console.log(`${x[0]} → ${r.ok ? '✅ Telegram đã nhận' : '❌ Telegram từ chối: ' + r.description}`);
  });
}

/** Giả lập Telegram gọi webhook để biết lỗi nằm ở code hay ở cấu hình deploy. */
function testWebhook() {
  const chatId = Number((prop_('ALLOWED_CHAT_ID') || '').trim());
  // 1. Chạy thẳng code xử lý (bỏ qua webhook)
  handleUpdate_({ update_id: Date.now(), message: { chat: { id: chatId }, text: '/help' } });
  console.log('1. Đã chạy code trực tiếp. Nếu Telegram nhận được tin hướng dẫn (/help) thì code OK.');
  // 2. Gọi URL webhook y như Telegram
  const res = UrlFetchApp.fetch(webhookUrl_(), {
    method: 'post', contentType: 'application/json', followRedirects: false, muteHttpExceptions: true,
    payload: JSON.stringify({ update_id: Date.now() + 1, message: { chat: { id: chatId }, text: '/today' } }),
  });
  const loc = res.getHeaders()['Location'] || '';
  console.log(`2. HTTP ${res.getResponseCode()} → ${loc ? loc.split('?')[0] + '?…(đã ẩn)' : res.getContentText().slice(0, 300)}`);
  if (loc.indexOf('accounts.google.com') >= 0) return console.log('❌ Bản deploy chưa cho phép "Bất kỳ ai" truy cập (Google đòi đăng nhập).');
  if (loc.indexOf('googleusercontent.com') < 0) return console.log('❌ Không nhận được chuyển hướng quen thuộc của Apps Script. Kiểm tra WEB_APP_URL (phải là địa chỉ kết thúc bằng /exec).');
  // Bước quyết định: xem web app TRẢ VỀ gì. Chạy đúng thì là chữ "ok". Nếu là trang HTML thì bản đã triển khai đang lỗi.
  const body = UrlFetchApp.fetch(loc, { muteHttpExceptions: true }).getContentText();
  const peek = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  console.log(`3. Web app trả về: ${peek || '(rỗng)'}`);
  if (body.trim() === 'ok') console.log('✅ Web app đã xử lý yêu cầu. Telegram sẽ nhận được tin /today (kiểm tra xem tin 📅 có về không).');
  else console.log('❌ Web app KHÔNG trả về "ok": bản đã triển khai đang lỗi (thiếu quyền, lỗi cú pháp hoặc code cũ). Cấp quyền bằng cách chạy một hàm trong trình soạn thảo, rồi Triển khai → Phiên bản mới.');
}
