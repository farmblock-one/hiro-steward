/**
 * Entry points.
 *  - doPost: webhook Telegram (URL web app + ?secret=...)
 *  - doGet:  web app cho iPhone (URL web app + ?key=...)
 *  - setup / setWebhook / installTriggers: chạy tay 1 lần trong Apps Script editor.
 */

function doPost(e) {
  try {
    // Apps Script không đọc được header, nên secret đi qua query string.
    if (!e || !e.parameter || e.parameter.secret !== prop_('WEBHOOK_SECRET')) return ok_();
    const update = JSON.parse(e.postData.contents);
    // Telegram có thể gửi lại cùng 1 update -> chống ghi trùng.
    const cache = CacheService.getScriptCache();
    const key = 'upd_' + update.update_id;
    if (cache.get(key)) return ok_();
    cache.put(key, '1', 21600);
    handleUpdate_(update);
  } catch (err) {
    console.error(err && err.stack || err);
  }
  return ok_();
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

/** Đăng ký webhook với Telegram. Chạy sau khi Deploy web app và đặt WEB_APP_URL. */
function setWebhook() {
  const r = tg_('setWebhook', { url: webhookUrl_(), drop_pending_updates: true, allowed_updates: ['message'] });
  tg_('setMyCommands', { commands: [
    { command: 'today', description: 'Tóm tắt hôm nay' },
    { command: 'thongke', description: 'Chi tiêu tháng này (thêm "tuan" cho tuần)' },
    { command: 'undo', description: 'Xoá khoản chi vừa ghi' },
    { command: 'habits', description: 'Xem thói quen & chuỗi ngày' },
    { command: 'habit_add', description: 'Thêm thói quen: /habit_add Đọc sách 5' },
    { command: 'todo', description: 'Thêm việc: /todo Gửi báo cáo mai #work' },
    { command: 'tasks', description: 'Danh sách việc đang mở' },
    { command: 'done', description: 'Hoàn thành việc: /done 3' },
    { command: 'app', description: 'Mở web app' },
    { command: 'help', description: 'Hướng dẫn' },
  ] });
  console.log(JSON.stringify(r));
  console.log(JSON.stringify(tg_('getWebhookInfo')));
}

/** Nhắc nhở mỗi tối 21h. */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'eveningReminder')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('eveningReminder').timeBased().everyDays(1).atHour(21).inTimezone(TZ).create();
}

function eveningReminder() {
  const chatId = prop_('ALLOWED_CHAT_ID');
  if (chatId) send_(chatId, '🌙 Tổng kết ngày\n' + dailyDigest_());
}

/** Kiểm tra cấu hình khi bot không trả lời. Chạy tay rồi xem Nhật ký thực thi. */
function diagnose() {
  const p = PropertiesService.getScriptProperties().getProperties();
  ['TELEGRAM_TOKEN', 'ALLOWED_CHAT_ID', 'WEB_APP_URL', 'WEBHOOK_SECRET', 'WEB_KEY', 'SHEET_ID', 'GEMINI_API_KEY'].forEach(k => {
    const shown = k === 'ALLOWED_CHAT_ID' || k === 'WEB_APP_URL' ? JSON.stringify(p[k]) : 'đã đặt';
    console.log(`${k}: ${p[k] ? shown : '❌ CHƯA ĐẶT'}`);
  });
  if (!p.TELEGRAM_TOKEN) return;
  const me = tg_('getMe');
  console.log(me.ok ? `Bot: @${me.result.username}` : '❌ TELEGRAM_TOKEN sai');
  const info = tg_('getWebhookInfo').result || {};
  console.log(`Webhook URL: ${info.url || '❌ CHƯA ĐẶT (chạy setWebhook)'}`);
  console.log(`Tin đang chờ: ${info.pending_update_count}`);
  if (info.last_error_message) console.log(`Lỗi gần nhất từ Telegram: ${info.last_error_message}`);
  if (p.ALLOWED_CHAT_ID) {
    const r = tg_('sendMessage', { chat_id: p.ALLOWED_CHAT_ID.trim(), text: '🔧 Test từ diagnose(): bot gửi được tin cho bạn.' });
    console.log(r.ok ? 'Gửi tin thử: OK' : `❌ Gửi tin thử thất bại: ${r.description}`);
  }
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
  console.log(`2. HTTP ${res.getResponseCode()} → ${loc || res.getContentText().slice(0, 300)}`);
  if (loc.indexOf('accounts.google.com') >= 0) console.log('❌ Bản deploy chưa cho phép "Bất kỳ ai" truy cập.');
  else if (loc.indexOf('googleusercontent.com') >= 0) console.log('✅ Webhook chạy được. Telegram sẽ nhận được tin /today.');
}
