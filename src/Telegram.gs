function tg_(method, payload) {
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${prop_('TELEGRAM_TOKEN')}/${method}`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (!data.ok) console.error('Telegram error', method, res.getContentText());
  return data;
}

function send_(chatId, text) {
  // Telegram giới hạn 4096 ký tự/tin.
  for (let i = 0; i < text.length; i += 4000) {
    tg_('sendMessage', { chat_id: chatId, text: text.slice(i, i + 4000), disable_web_page_preview: true });
  }
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
  const base = prop_('WEB_APP_URL');
  return base && prop_('WEB_KEY') ? `${base}?key=${encodeURIComponent(prop_('WEB_KEY'))}` : null;
}
