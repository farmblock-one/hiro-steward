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

// ---------- Ghi việc bằng giọng nói / text ----------

const TASK_MODEL_DEFAULT = 'gemini-flash-lite-latest'; // nhanh, nhẹ, free tier; đổi bằng Script Property GEMINI_TASK_MODEL

function taskPrompt_(projects, hasAudio) {
  const today = today_(), dow = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][new Date(today + 'T12:00:00Z').getUTCDay()];
  return `Bạn giúp người dùng ghi một công việc cần làm. Hôm nay là ${dow}, ${today} (giờ Việt Nam).
${hasAudio ? 'Nghe đoạn ghi âm tiếng Việt và chép lại thành "transcript". ' : ''}Tách thành các trường:
- title: việc cần làm, ngắn gọn, bắt đầu bằng động từ, giữ tiếng Việt, bỏ phần dự án/hạn/mức gấp ra khỏi title.
- project: dự án hoặc khu vực/đối tượng của việc. Dự án đã có: ${JSON.stringify(projects)}. Nếu khớp một dự án đã có thì dùng đúng nguyên văn tên đó, nếu không thì đặt tên mới thật ngắn (1-3 từ) từ nội dung; không rõ thì null.
- due: hạn chót dạng yyyy-MM-dd (đổi "mai", "thứ 6 tuần sau", "cuối tuần", "15/11"... ra ngày thật dựa vào hôm nay); không nhắc tới thì null.
- priority: "high" nếu gấp/khẩn/quan trọng/sát hạn trong 1-2 ngày, "low" nếu không gấp/khi rảnh, còn lại "medium".
Chỉ trả về một JSON: {${hasAudio ? '"transcript":"...",' : ''}"title":"...","project":"... hoặc null","due":"yyyy-MM-dd hoặc null","priority":"high|medium|low"}`;
}

/** Ép kết quả AI về đúng kiểu. Dự án gần giống tên đã có thì dùng lại tên cũ để khỏi đẻ ra biến thể. */
function sanitizeTask_(raw, projects) {
  raw = raw && typeof raw === 'object' ? raw : {};
  let project = clip_(raw.project, 40).replace(/^#/, '');
  if (/^(null|none|không rõ)$/i.test(project) || domainLike_(project)) project = '';
  const hit = project && projects.find(p => fold_(p) === fold_(project));
  if (hit) project = hit;
  let due = isDay_(raw.due) ? String(raw.due) : '';
  if (due && (due < today_() || due > addDays_(today_(), 730))) due = '';
  return { transcript: clip_(raw.transcript, 600), title: capitalize_(clip_(raw.title, 200)), project, due, priority: priorityKey_(raw.priority) || 'medium' };
}

/** input: {text} hoặc {audio: base64, mime}. Trả về {transcript, title, project, due, priority} hoặc null nếu AI lỗi. 1 lần gọi duy nhất, kể cả khi có voice. */
function aiTask_(input) {
  const projects = taskProjects_(), hasAudio = !!input.audio;
  const parts = [{ text: taskPrompt_(projects, hasAudio) }];
  if (hasAudio) parts.push({ inlineData: { mimeType: input.mime || 'audio/webm', data: input.audio } });
  else parts.push({ text: 'Nội dung: ' + JSON.stringify(String(input.text || '').slice(0, 1000)) });
  const raw = gemini_(parts, true, { model: prop_('GEMINI_TASK_MODEL') || TASK_MODEL_DEFAULT });
  return raw ? sanitizeTask_(raw, projects) : null;
}

/** Chạy tay trong trình soạn thảo: thử AI ghi việc với 1 câu mẫu và in kết quả (không ghi gì vào Sheet). */
function testTaskAI() {
  console.log(`Key: ${prop_('GEMINI_API_KEY') ? 'GEMINI_API_KEY đã đặt' : '❌ CHƯA ĐẶT GEMINI_API_KEY'} · model: ${prop_('GEMINI_TASK_MODEL') || TASK_MODEL_DEFAULT}`);
  const r = aiTask_({ text: 'Gọi chị Mai chốt báo giá dự án ABC trước thứ 6, gấp' });
  console.log(r ? '✅ AI tách được: ' + JSON.stringify(r) : '❌ ' + GEMINI_STATE.lastError + '\nNếu lỗi 404 model: đặt GEMINI_TASK_MODEL = gemini-flash-latest');
}
