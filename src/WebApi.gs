/**
 * Hàm gọi từ web app qua google.script.run.
 * Web app deploy ở chế độ "Anyone" (bắt buộc để Telegram gọi webhook), nên MỌI hàm ở đây
 * đều phải kiểm tra key.
 */

function auth_(key) {
  if (!key || key !== prop_('WEB_KEY')) throw new Error('Unauthorized');
}

function api_dashboard(key) {
  auth_(key);
  const t = today_();
  const exp = expenses_();
  const logs = habitLogs_();
  const last7 = [];
  for (let i = 6; i >= 0; i--) last7.push(addDays_(t, -i));
  return {
    today: t,
    finance: {
      totals: spendingTotals_(exp),
      byCategory: spendingByCategory_(monthStart_(t), t, exp),
      recent: exp.slice(-15).reverse(),
    },
    habits: habits_().map(h => {
      const st = habitStats_(h.name, logs);
      return { name: h.name, target: h.target, streak: st.streak, week: st.week,
        days: last7.map(d => ({ date: d, done: st.days.has(d) })) };
    }),
    tasks: sortTasks_(tasks_(false)).map(x => ({ id: x.id, title: x.title, status: x.status, due: x.due, project: x.project, priority: x.priority })),
    projects: taskProjects_(),
    aiTasks: aiEnabled_(),
    leads: rankedLeads_().map(apiLead_),
    focusSize: FOCUS_SIZE,
    stages: LEAD_STAGES.map(s => ({ key: s.key, label: s.label })),
    staleDays: STALE_DAYS,
    email: emailDashboard_(),
  };
}

function apiLead_(l) {
  return { id: l.id, name: l.name, contact: l.contact, stage: l.stage, stageLabel: l.stageLabel, value: l.value,
    next: l.next, due: l.due, source: l.source, note: l.note, lastContact: l.lastContact,
    daysSince: l.daysSince, state: l.state, stale: l.stale, score: l.score, why: l.why, waitDays: l.waitDays };
}

function api_quickAdd(key, text) {
  auth_(key);
  return handleText_(text, 'web');
}

function api_addExpense(key, text) {
  auth_(key);
  const out = addExpenseText_(String(text || ''), 'web');
  if (!out) throw new Error('Chưa thấy số tiền. Ví dụ: cafe 35k, hôm qua grab 120k, tiền nhà 5tr');
  return out;
}

function api_undoExpense(key) {
  auth_(key);
  return undoLastExpense_();
}

function api_addLeadText(key, text) {
  auth_(key);
  const f = parseLeadText_(String(text || ''));
  if (!f.name) throw new Error('Nhập tên lead. Ví dụ: ABC Corp | 50tr | gửi báo giá | thứ 6');
  const r = createLead_(f);
  if (r.error) throw new Error(r.error);
  return addLeadReply_(r.id);
}

function api_toggleHabit(key, name, date) {
  auth_(key);
  return toggleHabit_(name, date);
}

function api_addHabit(key, name, target) {
  auth_(key);
  return addHabit_(name, Number(target) || 7);
}

function api_addTask(key, text) {
  auth_(key);
  return addTask_(text);
}

/** Tách câu thành {title, project, due, priority}. Có Gemini thì dùng AI, không thì (hoặc khi AI lỗi) dùng bộ tách theo quy tắc. */
function api_parseTask(key, text) {
  auth_(key);
  text = String(text || '').trim();
  if (!text) throw new Error('Chưa có nội dung.');
  const rule = parseTaskText_(text);
  let ai = null;
  if (aiEnabled_()) { try { ai = aiTask_({ text }); } catch (e) { console.error(e); } }
  const r = ai ? { title: ai.title || rule.title, project: rule.project || ai.project, due: rule.due || ai.due, priority: rule.priority || ai.priority }
    : { title: rule.title, project: rule.project, due: rule.due, priority: rule.priority || 'medium' };
  return Object.assign(r, { text, ai: !!ai, aiError: aiEnabled_() && !ai ? GEMINI_STATE.lastError : '' });
}

/** Ghi âm -> transcript + các trường, trong 1 lần gọi Gemini. */
function api_parseTaskAudio(key, audioB64, mime) {
  auth_(key);
  if (!aiEnabled_()) throw new Error('Cần GEMINI_API_KEY để hiểu giọng nói. Bạn vẫn gõ text được.');
  if (!audioB64 || String(audioB64).length > 8e6) throw new Error('Đoạn ghi âm trống hoặc quá dài, thử nói ngắn hơn.');
  const a = aiTask_({ audio: String(audioB64), mime: String(mime || 'audio/webm').split(';')[0] });
  if (!a) throw new Error('AI chưa nghe được: ' + GEMINI_STATE.lastError);
  if (!a.title && !a.transcript) throw new Error('Không nghe rõ, thử nói lại nhé.');
  return { text: a.transcript || a.title, title: a.title, project: a.project, due: a.due, priority: a.priority, ai: true, aiError: '' };
}

function api_saveTask(key, f) {
  auth_(key);
  const r = createTask_(f || {});
  if (r.error) throw new Error(r.error);
  return taskReply_(r);
}

function api_setTask(key, id, status) {
  auth_(key);
  return setTaskStatus_(id, status);
}

function api_leadSave(key, f) {
  auth_(key);
  f = f || {};
  if (!f.id) {
    const created = createLead_(f);
    if (created.error) throw new Error(created.error);
    return addLeadReply_(created.id);
  }
  const r = resolveLead_(f.id); if (r.error) throw new Error(r.error);
  const cells = {};
  if (f.name != null && String(f.name).trim()) cells[LC.NAME] = capitalize_(f.name);
  if (f.contact != null) cells[LC.CONTACT] = f.contact;
  if (f.value != null) cells[LC.VALUE] = parseValue_(f.value);
  if (f.next != null) cells[LC.NEXT] = f.next;
  if (f.due != null) cells[LC.DUE] = f.due;
  if (f.source != null) cells[LC.SOURCE] = f.source;
  if (f.note != null) cells[LC.NOTE] = f.note;
  if (f.stage) {
    const k = stageKey_(f.stage);
    if (k) cells[LC.STAGE] = stageByKey_(k).label;
  }
  setLeadCells_(r.lead, cells);
  return 'Đã lưu ' + (cells[LC.NAME] || r.lead.name);
}

function api_leadLog(key, id, note, next, due) {
  auth_(key);
  const r = resolveLead_(id); if (r.error) throw new Error(r.error);
  note = String(note || '').trim(); next = String(next || '').trim();
  if (!note && !next) throw new Error('Nhập ghi chú hoặc next action.');
  if (note) appendLeadLog_(r.lead, note);
  const cells = { [LC.LAST]: today_() };
  if (next) { cells[LC.NEXT] = capitalize_(next); cells[LC.DUE] = due || addDays_(today_(), 1); }
  setLeadCells_(r.lead, cells);
  return `📞 Đã ghi liên hệ với ${r.lead.name}` + (next ? ` · next: ${capitalize_(next)}` : '');
}

function api_leadStage(key, id, stage, reason) {
  auth_(key);
  return setLeadStage_(id, stage, reason);
}

function api_leadSnooze(key, id, days) {
  auth_(key);
  return snoozeLead_(id, days);
}

function api_leadSpread(key, perDay) {
  auth_(key);
  return spreadOverdue_(perDay);
}

function api_emailDismissOld(key, days) {
  auth_(key);
  return dismissOldEmail_(days);
}

function api_emailScan(key) {
  auth_(key);
  return emailScanNow_();
}

function api_emailAccept(key, id) {
  auth_(key);
  return acceptEmailInsight_(id);
}

function api_emailDismiss(key, id) {
  auth_(key);
  return dismissEmailInsight_(id);
}

function api_leadHistory(key, id) {
  auth_(key);
  return leadHistory_(id);
}

// ---------- API JSON cho web app host ngoài (GitHub Pages) ----------

const API_FUNCTIONS = {
  dashboard: api_dashboard,
  quickAdd: api_quickAdd,
  addExpense: api_addExpense,
  undoExpense: api_undoExpense,
  addLeadText: api_addLeadText,
  toggleHabit: api_toggleHabit,
  addHabit: api_addHabit,
  addTask: api_addTask,
  parseTask: api_parseTask,
  parseTaskAudio: api_parseTaskAudio,
  saveTask: api_saveTask,
  setTask: api_setTask,
  leadSave: api_leadSave,
  leadLog: api_leadLog,
  leadStage: api_leadStage,
  leadSnooze: api_leadSnooze,
  leadHistory: api_leadHistory,
  emailScan: api_emailScan,
  emailDismissOld: api_emailDismissOld,
  leadSpread: api_leadSpread,
  emailAccept: api_emailAccept,
  emailDismiss: api_emailDismiss,
};

function apiResponse_(body) {
  let out;
  try {
    const req = JSON.parse(body);
    const fn = Object.prototype.hasOwnProperty.call(API_FUNCTIONS, req.fn) ? API_FUNCTIONS[req.fn] : null;
    if (!fn) throw new Error('Unknown function');
    out = { ok: true, result: fn.apply(null, [req.key].concat(req.args || [])) };
  } catch (err) {
    console.error(err && err.stack || err);
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
