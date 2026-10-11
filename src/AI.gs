/**
 * AI qua Gemini API (free tier của Google AI Studio). Không bắt buộc:
 * thiếu GEMINI_API_KEY thì bot vẫn chạy bằng parser quy tắc, chỉ mất voice + hiểu câu tự do.
 * Đổi model bằng Script Property GEMINI_MODEL (vd. gemini-flash-lite-latest để rẻ hơn).
 */

function aiEnabled_() {
  return !!prop_('GEMINI_API_KEY');
}

const GEMINI_STATE = { lastError: '' };

/** opts.key / opts.model: dùng key riêng cho email (xem README mục Email về quyền riêng tư). */
function gemini_(parts, asJson, opts) {
  opts = opts || {};
  const key = opts.key || prop_('GEMINI_API_KEY');
  GEMINI_STATE.lastError = '';
  if (!key) { GEMINI_STATE.lastError = 'chưa có API key'; return null; }
  const model = opts.model || prop_('GEMINI_MODEL') || 'gemini-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: Object.assign({ temperature: 0 }, asJson ? { responseMimeType: 'application/json' } : {}),
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
    headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    console.error('Gemini error', res.getResponseCode(), res.getContentText().slice(0, 300));
    let why = '';
    try { why = JSON.parse(res.getContentText()).error.message || ''; } catch (e) { /* không phải JSON */ }
    GEMINI_STATE.lastError = `HTTP ${res.getResponseCode()} (model ${model})` + (why ? ': ' + why.slice(0, 160) : '');
    return null;
  }
  const data = JSON.parse(res.getContentText());
  const cand = data.candidates && data.candidates[0];
  const text = cand && cand.content && cand.content.parts ? cand.content.parts.map(p => p.text || '').join('') : '';
  if (!asJson) return text.trim();
  try { return JSON.parse(text); } catch (e) { console.error('Bad JSON from Gemini', text); return null; }
}

/** Chuyển voice (ogg từ Telegram) thành text. */
function transcribe_(blob, mimeType) {
  return gemini_([
    { text: 'Chép lại chính xác nội dung tin nhắn thoại tiếng Việt này, chỉ trả về văn bản, không giải thích. ' +
        'Viết số tiền dạng ngắn như "35k", "1tr2", "200k".' },
    { inlineData: { mimeType: mimeType || 'audio/ogg', data: Utilities.base64Encode(blob.getBytes()) } },
  ], false);
}

/**
 * Phân loại câu tự do.
 * @return {{intent:string, amount?:number, category?:string, description?:string, habit?:string, task?:string, due?:string}|null}
 */
function classify_(text) {
  const habits = habits_().map(h => h.name);
  const prompt =
    `Bạn là trợ lý quản lý cuộc sống. Hôm nay là ${today_()} (múi giờ Việt Nam).\n` +
    `Thói quen đang theo dõi: ${JSON.stringify(habits)}\n` +
    `Danh mục chi tiêu: ${JSON.stringify(Object.keys(CATEGORIES).concat(DEFAULT_CATEGORY))}\n` +
    'Phân loại tin nhắn của người dùng và trả về JSON đúng dạng:\n' +
    '{"intent":"expense|habit|task|lead|unknown","amount":số VND hoặc null,"category":tên danh mục hoặc null,' +
    '"description":mô tả ngắn hoặc null,"habit":tên thói quen (phải nằm trong danh sách) hoặc null,' +
    '"task":nội dung công việc hoặc null,"due":"yyyy-MM-dd" hoặc null,' +
    '"lead":{"name":tên khách/công ty,"contact":người liên hệ hoặc null,"value":số VND hoặc null,' +
    '"next_action":việc tiếp theo hoặc null,"due":"yyyy-MM-dd" hoặc null} hoặc null}\n' +
    'Dùng intent "lead" khi người dùng nói về khách hàng tiềm năng/deal/đối tác cần theo dõi.\n' +
    `Tin nhắn: ${JSON.stringify(text)}`;
  return gemini_([{ text: prompt }], true);
}

function aiCategory_(desc) {
  if (!aiEnabled_() || !desc) return null;
  const cats = Object.keys(CATEGORIES).concat(DEFAULT_CATEGORY);
  const r = gemini_([{ text: `Khoản chi "${desc}" thuộc danh mục nào trong ${JSON.stringify(cats)}? ` +
      'Trả về JSON {"category": "..."}' }], true);
  return r && cats.indexOf(r.category) >= 0 ? r.category : null;
}

/**
 * Chạy tay để kiểm tra key + model Gemini dành cho email: in ra model đang dùng, kết quả gọi thử,
 * và nếu model không tồn tại thì liệt kê các model mà key này dùng được.
 */
function testGeminiEmail() {
  const o = emailGeminiOpts_();
  console.log(`Key email: ${prop_('GEMINI_EMAIL_KEY') ? 'GEMINI_EMAIL_KEY' : 'GEMINI_API_KEY (chưa đặt key riêng)'} · model: ${o.model || prop_('GEMINI_MODEL') || 'gemini-flash-latest'}`);
  const r = gemini_([{ text: 'Trả về JSON {"ok":true}' }], true, o);
  if (r) return console.log('✅ Gemini trả lời bình thường: ' + JSON.stringify(r));
  console.log('❌ ' + GEMINI_STATE.lastError);
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': o.key || '' }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return console.log('Không liệt kê được model: HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
  const names = (JSON.parse(res.getContentText()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
  console.log('Model dùng được với key này (chép đúng vào GEMINI_EMAIL_MODEL):\n' + names.filter(n => /flash/.test(n)).join('\n'));
}
