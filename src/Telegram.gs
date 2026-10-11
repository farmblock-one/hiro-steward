function tg_(method, payload) {
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${prop_('TELEGRAM_TOKEN')}/${method}`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (!data.ok) console.error('Telegram error', method, res.getContentText());
  return data;
}

/** Cắt tin dài theo ranh giới dòng, không bao giờ cắt giữa một emoji (cặp ký tự thay thế). */
function chunkText_(text, size) {
  const out = []; let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + size / 2) end = nl + 1;
      const c = text.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end--;
    }
    out.push(text.slice(i, end)); i = end;
  }
  return out;
}

/**
 * Gửi tin cho Telegram (tối đa 4096 ký tự mỗi tin). Nếu Telegram từ chối, thử lại bản đã bỏ emoji/ký tự đặc biệt
 * để tin chắc chắn tới được, và ghi rõ lý do từ chối vào nhật ký.
 */
function send_(chatId, text) {
  chunkText_(String(text), 4000).forEach(chunk => {
    let r = tg_('sendMessage', { chat_id: chatId, text: chunk, disable_web_page_preview: true });
    if (!r.ok) {
      console.error('Telegram từ chối tin, thử lại không emoji: ' + (r.description || ''));
      const plain = chunk.replace(/[\u{10000}-\u{10FFFF}\u200d\ufe0f]/gu, '').replace(/[^\S\n]{2,}/g, ' ').trim();
      r = tg_('sendMessage', { chat_id: chatId, text: plain || '(tin nhắn trống)', disable_web_page_preview: true });
    }
  });
}

function downloadTelegramFile_(fileId) {
  const info = tg_('getFile', { file_id: fileId });
  if (!info.ok) return null;
  return UrlFetchApp.fetch(`https://api.telegram.org/file/bot${prop_('TELEGRAM_TOKEN')}/${info.result.file_path}`).getBlob();
}

function handleUpdate_(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return;
  const chatId = String(msg.chat.id);

  // Chỉ phục vụ đúng 1 người. Lần đầu chưa cấu hình thì báo chat ID để bạn điền vào.
  const allowed = (prop_('ALLOWED_CHAT_ID') || '').trim();
  if (!allowed) {
    send_(chatId, `Chat ID của bạn là ${chatId}.\nĐặt Script Property ALLOWED_CHAT_ID = ${chatId} rồi nhắn lại nhé.`);
    return;
  }
  if (chatId !== allowed) return;

  const voice = msg.voice || msg.audio;
  if (voice) {
    if (!aiEnabled_()) return send_(chatId, 'Cần GEMINI_API_KEY để hiểu voice.');
    const blob = downloadTelegramFile_(voice.file_id);
    const text = blob && transcribe_(blob, voice.mime_type || 'audio/ogg');
    if (!text) return send_(chatId, '😕 Không nghe rõ, thử lại hoặc gõ text nhé.');
    return send_(chatId, `🎙 “${text}”\n` + handleText_(text, 'voice'));
  }

  const text = (msg.text || '').trim();
  if (!text) return;
  send_(chatId, text.startsWith('/') ? handleCommand_(text) : handleText_(text, 'text'));
}

function webhookUrl_() {
  const base = prop_('WEB_APP_URL') || ScriptApp.getService().getUrl();
  return `${base}?secret=${encodeURIComponent(prop_('WEBHOOK_SECRET'))}`;
}

function webAppLink_() {
  const key = prop_('WEB_KEY');
  if (!key) return null;
  const pages = (prop_('PAGES_URL') || '').trim();
  const api = (prop_('WEB_APP_URL') || '').trim();
  // Hash (#...) không bao giờ gửi lên server nên key không lộ qua log của GitHub.
  if (pages && api) return `${pages}#key=${encodeURIComponent(key)}&api=${encodeURIComponent(api)}`;
  return api ? `${api}?key=${encodeURIComponent(key)}` : null;
}

// ---------- Chế độ polling (thay cho webhook) ----------
// Webhook của Apps Script luôn trả 302 nên Telegram coi mọi tin là lỗi, gửi lại và có thể trễ hoặc không giao.
// Polling thì script tự hỏi Telegram mỗi phút: không cần web app công khai, không có 302, trả lời chậm tối đa ~1 phút.

/** Chuyển sang polling: xoá webhook, bật trigger mỗi phút. Quay lại webhook bằng setWebhook. */
function usePolling() {
  const r = tg_('deleteWebhook', { drop_pending_updates: true });
  if (!r.ok) throw new Error('Không xoá được webhook: ' + (r.description || ''));
  setProp_('TELEGRAM_MODE', 'poll');
  setProp_('TG_OFFSET', '0');
  setProp_('TG_POLL_BUSY', '0');
  setBotCommands_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pollTelegram').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pollTelegram').timeBased().everyMinutes(1).create();
  console.log('✅ Đã chuyển sang polling. Nhắn /help cho bot, tối đa ~1 phút sẽ có trả lời. Tin nhắn cũ chưa xử lý đã bị bỏ.');
}

/** Chạy mỗi phút: lấy tin mới từ Telegram và xử lý. Mỗi tin chỉ xử lý một lần (lưu mốc trước khi xử lý). */
function pollTelegram() {
  if (prop_('TELEGRAM_MODE') !== 'poll') return;
  const busy = Number(prop_('TG_POLL_BUSY')) || 0;
  if (Date.now() - busy < 55000) return; // một lượt trước còn đang chạy
  setProp_('TG_POLL_BUSY', Date.now());
  try {
    const offset = Number(prop_('TG_OFFSET')) || 0;
    const r = tg_('getUpdates', { offset: offset || undefined, timeout: 0, limit: 20, allowed_updates: ['message'] });
    const updates = r.ok ? r.result || [] : [];
    if (!updates.length) return;
    setProp_('TG_OFFSET', updates[updates.length - 1].update_id + 1);
    updates.forEach(u => {
      try { handleUpdate_(u); }
      catch (err) { console.error(err && err.stack || err); notifyHandlerError_(u, err); }
    });
  } finally {
    setProp_('TG_POLL_BUSY', '0');
  }
}
