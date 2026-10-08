/**
 * Bộ não: nhận 1 câu (text hoặc voice đã chép) và quyết định là chi tiêu / thói quen / công việc.
 * Thứ tự: tiền tố công việc -> khớp thói quen -> có số tiền -> hỏi AI -> hướng dẫn.
 * Dùng chung cho Telegram và ô "nhập nhanh" trên web app.
 */

const LEAD_PREFIX_RE = /^(lead|khách|khach)\s*[:\-]?\s+/i;
const TASK_PREFIX_RE = /^(todo|việc|viec|cv|task|nhắc|nhớ)\s*[:\-]?\s+/i;

function handleText_(text, source) {
  text = String(text || '').trim();
  if (!text) return HELP_TEXT;

  // 0. Lead: "lead ABC Corp | 50tr | gửi báo giá | thứ 6"
  const lp = text.match(LEAD_PREFIX_RE);
  if (lp) return addLead_(text.slice(lp[0].length));

  // 1. Công việc: "todo gửi báo cáo mai"
  const tp = text.match(TASK_PREFIX_RE);
  if (tp) return addTask_(text.slice(tp[0].length));

  const past = extractPastDay_(text);
  const parsed = parseAmount_(past.text);

  // 2. Thói quen: "đọc sách 30 trang" (số không có đơn vị tiền => không phải chi tiêu)
  const habit = matchHabit_(past.text);
  if (habit && !(parsed && parsed.hasUnit)) return logHabit_(habit.name, text, past.date);

  // 3. Chi tiêu: "cafe 35k", "hôm qua đổ xăng 80k"
  if (parsed) {
    const desc = parsed.rest;
    const category = guessCategory_(desc) || aiCategory_(desc) || DEFAULT_CATEGORY;
    return logExpense_({ amount: parsed.amount, category, desc, source, raw: text, date: past.date });
  }

  // 4. Câu tự do -> AI
  if (aiEnabled_()) {
    const r = classify_(text);
    if (r && r.intent === 'expense' && r.amount > 0) {
      return logExpense_({ amount: r.amount, category: r.category || DEFAULT_CATEGORY,
        desc: r.description || text, source: source + '+ai', raw: text });
    }
    if (r && r.intent === 'habit' && r.habit) {
      const h = habits_().find(x => fold_(x.name) === fold_(r.habit));
      if (h) return logHabit_(h.name, text);
    }
    if (r && r.intent === 'task' && r.task) return addTask_(r.task, r.due || '');
    if (r && r.intent === 'lead' && r.lead && r.lead.name) {
      const res = createLead_({ name: r.lead.name, contact: r.lead.contact, value: r.lead.value,
        next: r.lead.next_action, due: r.lead.due });
      return res.error ? res.error : addLeadReply_(res.id);
    }
  }

  return '🤔 Mình chưa hiểu. Thử:\n• cafe 35k\n• đọc sách (tên thói quen)\n• todo gửi báo cáo mai #work\nHoặc /help';
}

const HELP_TEXT = [
  '👋 Hiro Steward — quản lý tiền, thói quen, công việc.',
  '',
  '💸 Chi tiêu: nhắn tự nhiên, vd “cafe 35k”, “đổ xăng 80k”, “hôm qua tiền nhà 5tr”',
  '   /thongke — tháng này · /thongke tuan — tuần này · /undo — xoá khoản vừa ghi',
  '',
  '🌱 Thói quen: /habit_add Tập thể dục 4  (4 lần/tuần)',
  '   Làm xong chỉ cần nhắn tên: “tập thể dục” · /habits — xem chuỗi',
  '',
  '🎯 Công việc: /todo Gửi báo cáo mai #work  (hoặc “todo …”)',
  '   /tasks — danh sách · /doing 3 · /done 3 · /reopen 3',
  '',
  '🐟 Lead (Account Manager):',
  '   /lead ABC Corp | 50tr | gửi báo giá | thứ 6 | @chị Mai',
  '   /log 3 đã gọi, khách quan tâm | gửi hợp đồng mai   (ghi liên hệ + next action)',
  '   /next 3 họp demo 25/10 · /snooze 3 2 · /stage 3 báo giá · /won 3 · /lost 3 giá cao',
  '   /leads (danh sách) · /pipeline (phễu) · 8h sáng bot tự nhắc',
  '',
  '🎙 Gửi voice cũng được (cần GEMINI_API_KEY).',
  '📱 /app — mở web app',
].join('\n');

function handleCommand_(text) {
  const m = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
  if (!m) return HELP_TEXT;
  const cmd = m[1].toLowerCase(), arg = m[2].trim();
  switch (cmd) {
    case 'start':
    case 'help': return HELP_TEXT;
    case 'chi': return arg ? handleText_(arg, 'text') : 'Vd: /chi cafe 35k';
    case 'undo': return undoLastExpense_();
    case 'thongke':
    case 'stats': return spendingReport_(arg);
    case 'habit_add': {
      const hm = arg.match(/^(.*?)(?:\s+(\d))?$/);
      return addHabit_(hm[1], hm[2] ? Number(hm[2]) : 7);
    }
    case 'habits': return habitReport_();
    case 'check': {
      const h = matchHabit_(arg);
      return h ? logHabit_(h.name, '') : 'Không tìm thấy thói quen đó. Xem /habits';
    }
    case 'todo': return addTask_(arg);
    case 'tasks': return taskReport_();
    case 'done': return setTaskStatus_(arg, TASK_STATUS.DONE);
    case 'doing': return setTaskStatus_(arg, TASK_STATUS.DOING);
    case 'reopen': return setTaskStatus_(arg, TASK_STATUS.TODO);
    case 'lead': return addLead_(arg);
    case 'leads': return leadReport_(arg);
    case 'pipeline': return pipelineReport_();
    case 'next': { const x = splitLeadRef_(arg); return setNextAction_(x.ref, x.rest); }
    case 'log': { const x = splitLeadRef_(arg); return logLeadContact_(x.ref, x.rest); }
    case 'stage': { const x = splitLeadRef_(arg); return setLeadStage_(x.ref, x.rest); }
    case 'won': { const x = splitLeadRef_(arg); return setLeadStage_(x.ref, 'won'); }
    case 'lost': { const x = splitLeadRef_(arg); return setLeadStage_(x.ref, 'lost', x.rest); }
    case 'snooze': {
      const m = arg.match(/^(.*?)(?:\s+(\d{1,2}))?$/);
      return snoozeLead_(m[1], m[2] || 1);
    }
    case 'morning': return morningBrief_();
    case 'today': return dailyDigest_();
    case 'app': return webAppLink_() || 'Chưa đặt WEB_APP_URL / WEB_KEY trong Script Properties.';
    default: return HELP_TEXT;
  }
}

/** Tóm tắt trong ngày: dùng cho /today và nhắc nhở buổi tối. */
function dailyDigest_() {
  const s = spendingTotals_();
  const logs = habitLogs_();
  const pending = habits_().filter(h => !habitStats_(h.name, logs).doneToday).map(h => h.name);
  const t = today_();
  const urgent = sortTasks_(tasks_(false).filter(x => x.due && x.due <= t));
  const leadsTxt = leadAttentionText_();
  return [
    `📅 ${prettyDate_(t)}`,
    `💰 Hôm nay đã chi ${money_(s.today)} · tháng này ${money_(s.month)}`,
    leadsTxt ? leadsTxt : '🐟 Lead: không có gì cần xử lý gấp.',
    pending.length ? `🐾 Chưa làm: ${pending.join(', ')}` : '🐾 Đã hoàn thành mọi thói quen hôm nay 💪',
    urgent.length ? `🎯 Đến hạn/quá hạn:\n${urgent.map(taskLine_).join('\n')}` : '🎯 Không có việc đến hạn.',
  ].join('\n\n');
}

/** Tin nhắc buổi sáng (8h): ưu tiên lead cần liên hệ. */
function morningBrief_() {
  const t = today_();
  const exp = expenses_(), y = addDays_(t, -1);
  const yesterday = exp.filter(e => e.date === y).reduce((a, e) => a + e.amount, 0);
  const leadsTxt = leadAttentionText_();
  const tasks = sortTasks_(tasks_(false).filter(x => x.due && x.due <= t));
  const parts = [`🐱☀️ Meo! Chào buổi sáng ${prettyDate_(t)}`];
  parts.push(leadsTxt || '🐟 Không có lead nào cần xử lý gấp hôm nay.');
  if (tasks.length) parts.push(`🎯 Việc đến hạn:\n${tasks.map(taskLine_).join('\n')}`);
  parts.push(`💰 Hôm qua đã chi ${money_(yesterday)}`);
  parts.push('Ghi nhanh sau mỗi cuộc gọi: /log <id> <ghi chú> | <việc tiếp theo>');
  return parts.join('\n\n');
}
