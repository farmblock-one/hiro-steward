/**
 * Bộ não: nhận 1 câu (text hoặc voice đã chép) và quyết định là chi tiêu / thói quen / công việc.
 * Thứ tự: tiền tố công việc -> khớp thói quen -> có số tiền -> hỏi AI -> hướng dẫn.
 * Dùng chung cho Telegram và ô "nhập nhanh" trên web app.
 */

const TASK_PREFIX_RE = /^(todo|việc|viec|cv|task|nhắc|nhớ)\s*[:\-]?\s+/i;

function handleText_(text, source) {
  text = String(text || '').trim();
  if (!text) return HELP_TEXT;

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
  return [
    `📅 ${prettyDate_(t)}`,
    `💸 Hôm nay đã chi ${money_(s.today)} · tháng này ${money_(s.month)}`,
    pending.length ? `🌱 Chưa làm: ${pending.join(', ')}` : '🌱 Đã hoàn thành mọi thói quen hôm nay 💪',
    urgent.length ? `🎯 Đến hạn/quá hạn:\n${urgent.map(taskLine_).join('\n')}` : '🎯 Không có việc đến hạn.',
  ].join('\n');
}
