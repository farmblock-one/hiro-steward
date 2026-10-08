// ===================== Config.gs =====================

/**
 * Cấu hình chung. Các giá trị bí mật (token, API key) để trong Script Properties,
 * KHÔNG hard-code ở đây. Xem README.md mục "Cài đặt".
 */

const TZ = 'Asia/Ho_Chi_Minh';

const SHEETS = {
  EXPENSES: {
    name: 'Expenses',
    headers: ['Thời gian', 'Ngày', 'Số tiền', 'Danh mục', 'Mô tả', 'Nguồn', 'Tin nhắn gốc'],
  },
  HABITS: {
    name: 'Habits',
    headers: ['Thói quen', 'Mục tiêu/tuần', 'Đang theo dõi', 'Ngày tạo'],
  },
  HABIT_LOG: {
    name: 'HabitLog',
    headers: ['Ngày', 'Thói quen', 'Ghi chú', 'Thời gian'],
  },
  TASKS: {
    name: 'Tasks',
    headers: ['ID', 'Công việc', 'Trạng thái', 'Hạn', 'Dự án', 'Ngày tạo', 'Ngày xong'],
  },
  LEADS: {
    name: 'Leads',
    headers: ['ID', 'Tên lead', 'Liên hệ', 'Giai đoạn', 'Giá trị', 'Next action', 'Hạn next action',
      'Nguồn', 'Ghi chú', 'Ngày tạo', 'Liên hệ cuối', 'Cập nhật', 'Lý do thua'],
  },
  LEAD_LOG: {
    name: 'LeadLog',
    headers: ['Ngày', 'ID lead', 'Tên lead', 'Ghi chú', 'Thời gian'],
  },
};

// Phễu bán hàng. Sheet lưu `label`; `alias` là các cách gõ tắt (đã bỏ dấu, chữ thường).
const LEAD_STAGES = [
  { key: 'new', label: 'Mới', alias: ['moi', 'new'] },
  { key: 'contacted', label: 'Đã liên hệ', alias: ['lien he', 'da lien he', 'contacted'] },
  { key: 'meeting', label: 'Họp/Demo', alias: ['hop', 'demo', 'hop demo', 'meeting'] },
  { key: 'proposal', label: 'Báo giá', alias: ['bao gia', 'proposal', 'quote'] },
  { key: 'negotiating', label: 'Đàm phán', alias: ['dam phan', 'negotiating'] },
  { key: 'won', label: 'Thắng', alias: ['thang', 'won', 'chot'] },
  { key: 'lost', label: 'Thua', alias: ['thua', 'lost', 'rot'] },
];
const LEAD_CLOSED = ['won', 'lost'];
const STALE_DAYS = 7; // quá số ngày này không liên hệ thì lead bị gắn cờ “nguội”

// Từ khoá -> danh mục chi tiêu. Khớp theo từ khoá dài nhất; sửa tuỳ ý.
const CATEGORIES = {
  'Ăn uống': ['ăn', 'cơm', 'phở', 'bún', 'miến', 'cháo', 'bánh mì', 'cafe', 'cà phê', 'cf', 'trà sữa',
    'trà', 'bia', 'nhậu', 'lẩu', 'nướng', 'bánh', 'highlands', 'starbucks', 'đi chợ', 'siêu thị', 'grabfood', 'shopeefood'],
  'Đi lại': ['grab', 'xăng', 'taxi', 'gojek', 'xanh sm', 'gửi xe', 'vé xe', 'bus', 'vé máy bay', 'rửa xe', 'sửa xe'],
  'Mua sắm': ['quần', 'áo', 'giày', 'dép', 'túi', 'shopee', 'lazada', 'tiki', 'tiktok shop', 'mỹ phẩm'],
  'Nhà cửa': ['tiền nhà', 'thuê nhà', 'tiền điện', 'tiền nước', 'internet', 'wifi', 'gas', 'đồ gia dụng'],
  'Sức khỏe': ['thuốc', 'khám', 'gym', 'bệnh viện', 'nha khoa', 'vitamin', 'yoga'],
  'Giải trí': ['phim', 'netflix', 'spotify', 'youtube', 'game', 'du lịch', 'karaoke', 'concert'],
  'Học tập': ['sách', 'khóa học', 'khoá học', 'học phí', 'udemy', 'coursera'],
  'Hóa đơn': ['điện thoại', '4g', '5g', 'nạp thẻ', 'bảo hiểm', 'icloud', 'google one', 'chatgpt', 'claude'],
  'Quà tặng': ['quà', 'biếu', 'mừng', 'đám cưới', 'sinh nhật', 'từ thiện'],
};
const DEFAULT_CATEGORY = 'Khác';

const TASK_STATUS = { TODO: 'todo', DOING: 'doing', DONE: 'done' };

// Script Properties
function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}


// ===================== Utils.gs =====================

// ---------- Spreadsheet ----------

function ss_() {
  let id = prop_('SHEET_ID');
  if (!id) {
    const created = SpreadsheetApp.create('Hiro Steward');
    created.setSpreadsheetTimeZone(TZ);
    id = created.getId();
    setProp_('SHEET_ID', id);
  }
  return SpreadsheetApp.openById(id);
}

function sheet_(def) {
  const ss = ss_();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Trả về [{row, values}] (row là số dòng thật trong sheet, bắt đầu từ 2). */
function rows_(def) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, def.headers.length).getValues()
    .map((values, i) => ({ row: i + 2, values }));
}

// ---------- Dates (dùng key dạng 'yyyy-MM-dd') ----------

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function dayKey_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

function addDays_(key, n) {
  const d = new Date(key + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Thứ Hai của tuần chứa ngày key. */
function weekStart_(key) {
  const dow = (new Date(key + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return addDays_(key, -dow);
}

function monthStart_(key) {
  return key.slice(0, 8) + '01';
}

function prettyDate_(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}` + (y !== today_().slice(0, 4) ? `/${y}` : '');
}

// ---------- Text ----------

function money_(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

/** Bỏ dấu tiếng Việt + lowercase, để so khớp mềm. */
function fold_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
}

function capitalize_(s) {
  s = String(s || '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Hạn chót bằng tiếng Việt ----------

const pad2_ = n => String(n).padStart(2, '0');

/**
 * Tìm 1 mốc thời gian trong câu và trả về ngày 'yyyy-MM-dd' cùng phần chữ còn lại.
 * Hiểu: hôm nay, mai, mốt, thứ 6 / t6 / CN (lần tới), thứ 2 tuần sau, tuần sau,
 * 3 ngày nữa, sau 2 tuần, dd/mm, dd/mm/yyyy. Thêm “hạn/deadline/trước/vào” phía trước cũng được.
 * “mai” chỉ nhận chữ thường để không nuốt tên người (chị Mai).
 * @return {{due:string, text:string}}  due rỗng nếu không thấy mốc nào.
 */
function extractDue_(text) {
  text = String(text || '');
  const t = today_();
  const L = '(?<![\\p{L}\\d])', R = '(?![\\p{L}\\d])';
  const pre = '(?:(?:hạn|deadline|trước|vào|đến)\\s+)?';
  const re = body => new RegExp(L + pre + body + R, 'u');
  const clean = s => s.replace(/\s+/g, ' ').replace(/^[\s,.:;\-–|]+|[\s,.:;\-–|]+$/g, '').trim();
  const nextWeekRe = new RegExp(L + 'tuần (?:sau|tới)' + R, 'u');
  const done = (due, rest) => ({ due, text: clean(rest) });

  let m = text.match(re('(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?'));
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31 && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(t.slice(0, 4));
    let due = `${y}-${pad2_(m[2])}-${pad2_(m[1])}`;
    if (!m[3] && due < t) due = `${y + 1}-${pad2_(m[2])}-${pad2_(m[1])}`;
    return done(due, text.replace(m[0], ' '));
  }
  if ((m = text.match(re('[Hh]ôm nay')))) return done(t, text.replace(m[0], ' '));
  if ((m = text.match(re('(?:[Nn]gày mai|mai)')))) return done(addDays_(t, 1), text.replace(m[0], ' '));
  if ((m = text.match(re('(?:[Nn]gày kia|[Nn]gày mốt|mốt)')))) return done(addDays_(t, 2), text.replace(m[0], ' '));

  if ((m = text.match(re('(?:[Tt]hứ\\s*([2-7])|[Tt]([2-7])|[Cc]hủ nhật|CN|cn)')))) {
    const dow = m[1] ? Number(m[1]) - 2 : m[2] ? Number(m[2]) - 2 : 6; // Thứ Hai = 0 ... Chủ nhật = 6
    let rest = text.replace(m[0], ' ');
    const nw = rest.match(nextWeekRe);
    if (nw) return done(addDays_(weekStart_(t), 7 + dow), rest.replace(nw[0], ' '));
    const todayDow = (new Date(t + 'T12:00:00Z').getUTCDay() + 6) % 7;
    let diff = (dow - todayDow + 7) % 7;
    if (diff === 0) diff = 7; // “thứ 6” nói đúng thứ 6 thì hiểu là thứ 6 tuần sau
    return done(addDays_(t, diff), rest);
  }
  if ((m = text.match(re('tuần (?:sau|tới)')))) return done(addDays_(weekStart_(t), 7), text.replace(m[0], ' '));

  if ((m = text.match(re('(?:sau\\s+(\\d{1,2})\\s*(ngày|tuần)|(\\d{1,2})\\s*(ngày|tuần)\\s*(?:nữa|tới))')))) {
    const n = Number(m[1] || m[3]), unit = m[2] || m[4];
    return done(addDays_(t, unit === 'tuần' ? n * 7 : n), text.replace(m[0], ' '));
  }
  return { due: '', text: clean(text) };
}

/** “ngày mai”, “quá hạn 2 ngày”, “T6 12/10”… dùng cho tin nhắn Telegram. */
function dueLabel_(due) {
  if (!due) return '';
  const t = today_();
  const diff = Math.round((new Date(due + 'T12:00:00Z') - new Date(t + 'T12:00:00Z')) / 86400000);
  if (diff < 0) return `quá hạn ${-diff} ngày`;
  if (diff === 0) return 'hôm nay';
  if (diff === 1) return 'mai';
  const dow = new Date(due + 'T12:00:00Z').getUTCDay();
  return `${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow]} ${prettyDate_(due)}`;
}


// ===================== Finance.gs =====================

/**
 * Tài chính: parse số tiền kiểu Việt Nam và ghi vào sheet Expenses.
 *
 * Hiểu được: 35k, 35 nghìn, 35 ngàn, 1tr, 1tr2 (=1.200.000), 1.5tr, 2 triệu, 2 củ,
 * 3 lít (=300k), 35000, 35.000, 35,000đ. Số trần < 1000 được hiểu là nghìn (cafe 35 = 35k).
 */

const UNIT_MULT = {
  'k': 1e3, 'nghìn': 1e3, 'ngàn': 1e3, 'ng': 1e3,
  'tr': 1e6, 'triệu': 1e6, 'm': 1e6, 'củ': 1e6,
  'lít': 1e5, 'xị': 1e5,
};
const AMOUNT_RE = /(\d+(?:[.,]\d+)*)\s*(nghìn|ngàn|triệu|vnđ|vnd|tr|củ|lít|xị|ng|k|m|đ)?(\d{1,3})?(?![\p{L}\d])/giu;

/** @return {{amount:number, hasUnit:boolean, rest:string}|null} */
function parseAmount_(text) {
  const matches = [];
  for (const m of String(text).matchAll(AMOUNT_RE)) {
    const unit = (m[2] || '').toLowerCase();
    const mult = UNIT_MULT[unit] || 1;
    let n;
    if (mult > 1 && /^\d+[.,]\d{1,2}$/.test(m[1])) n = Number(m[1].replace(',', '.')); // 1.5tr
    else n = Number(m[1].replace(/[.,]/g, ''));                                          // 35.000
    if (!isFinite(n)) continue;
    n *= mult;
    if (m[3] && mult > 1) n += Number(m[3]) * mult / Math.pow(10, m[3].length);         // 1tr2, 1k5
    else if (m[3]) continue;
    const hasUnit = !!unit;
    if (!hasUnit && n < 1000) n *= 1000;
    matches.push({ amount: Math.round(n), hasUnit, index: m.index, len: m[0].length });
  }
  if (!matches.length) return null;
  // Ưu tiên số có đơn vị; nếu không có thì lấy số lớn nhất.
  const withUnit = matches.filter(x => x.hasUnit);
  const best = withUnit.length ? withUnit[0] : matches.sort((a, b) => b.amount - a.amount)[0];
  const rest = (text.slice(0, best.index) + ' ' + text.slice(best.index + best.len))
    .replace(/\s+/g, ' ').replace(/^[\s,.:\-–]+|[\s,.:\-–]+$/g, '').trim();
  return { amount: best.amount, hasUnit: best.hasUnit, rest };
}

/** Đoán danh mục theo từ khoá dài nhất khớp được. */
function guessCategory_(desc) {
  const padded = ' ' + String(desc).toLowerCase().replace(/[^\p{L}\d]+/gu, ' ') + ' ';
  let best = null, bestLen = 0;
  for (const cat in CATEGORIES) {
    for (const kw of CATEGORIES[cat]) {
      if (kw.length > bestLen && padded.includes(' ' + kw + ' ')) { best = cat; bestLen = kw.length; }
    }
  }
  return best;
}

/** Tách "hôm qua"/"hôm kia" ra khỏi câu để ghi lùi ngày. */
function extractPastDay_(text) {
  const m = String(text).match(/(?:^|\s)(hôm qua|hôm kia)(?=\s|$)/i);
  if (!m) return { date: today_(), text };
  const back = m[1].toLowerCase() === 'hôm qua' ? 1 : 2;
  return { date: addDays_(today_(), -back), text: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
}

function logExpense_({ amount, category, desc, source, raw, date }) {
  sheet_(SHEETS.EXPENSES).appendRow([
    nowStr_(), date || today_(), amount, category || DEFAULT_CATEGORY,
    capitalize_(desc), source || 'text', raw || '',
  ]);
  const s = spendingTotals_();
  return `🐱💰 Đã ghi ${money_(amount)} · ${category || DEFAULT_CATEGORY}${desc ? ' · ' + capitalize_(desc) : ''}` +
    (date && date !== today_() ? ` (ngày ${prettyDate_(date)})` : '') +
    `\nHôm nay: ${money_(s.today)} | Tháng này: ${money_(s.month)}`;
}

function undoLastExpense_() {
  const sh = sheet_(SHEETS.EXPENSES);
  const last = sh.getLastRow();
  if (last < 2) return 'Chưa có khoản chi nào để xoá.';
  const v = sh.getRange(last, 1, 1, 5).getValues()[0];
  sh.deleteRow(last);
  return `🗑 Đã xoá: ${money_(v[2])} · ${v[3]} · ${v[4]}`;
}

function expenses_() {
  return rows_(SHEETS.EXPENSES).map(r => ({
    date: dayKey_(r.values[1]), amount: Number(r.values[2]) || 0,
    category: r.values[3] || DEFAULT_CATEGORY, desc: r.values[4],
  }));
}

function spendingTotals_(list) {
  list = list || expenses_();
  const t = today_(), w = weekStart_(t), m = monthStart_(t);
  const out = { today: 0, week: 0, month: 0 };
  for (const e of list) {
    if (e.date === t) out.today += e.amount;
    if (e.date >= w && e.date <= t) out.week += e.amount;
    if (e.date >= m && e.date <= t) out.month += e.amount;
  }
  return out;
}

function spendingByCategory_(fromKey, toKey, list) {
  const map = {};
  for (const e of list || expenses_()) {
    if (e.date >= fromKey && e.date <= toKey) map[e.category] = (map[e.category] || 0) + e.amount;
  }
  return Object.keys(map).map(name => ({ name, amount: map[name] })).sort((a, b) => b.amount - a.amount);
}

function spendingReport_(period) {
  const t = today_();
  const isWeek = /tuan|tuần|week|w/i.test(period || '');
  const from = isWeek ? weekStart_(t) : monthStart_(t);
  const cats = spendingByCategory_(from, t);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  if (!total) return `Chưa có chi tiêu nào ${isWeek ? 'tuần' : 'tháng'} này.`;
  const lines = cats.map(c => `• ${c.name}: ${money_(c.amount)} (${Math.round(c.amount * 100 / total)}%)`);
  return `📊 Chi tiêu ${isWeek ? 'tuần' : 'tháng'} này (từ ${prettyDate_(from)}): ${money_(total)}\n` + lines.join('\n');
}


// ===================== Habits.gs =====================

/** Thói quen: định nghĩa ở sheet Habits, mỗi lần hoàn thành là 1 dòng ở HabitLog. */

function habits_() {
  return rows_(SHEETS.HABITS)
    .filter(r => r.values[0] && r.values[2] !== false && String(r.values[2]).toLowerCase() !== 'false')
    .map(r => ({ name: String(r.values[0]), target: Number(r.values[1]) || 7, row: r.row }));
}

function addHabit_(name, target) {
  name = capitalize_(name);
  if (!name) return 'Cú pháp: /habit_add <tên> [số lần/tuần]\nVí dụ: /habit_add Tập thể dục 4';
  if (habits_().some(h => fold_(h.name) === fold_(name))) return `“${name}” đã có rồi.`;
  sheet_(SHEETS.HABITS).appendRow([name, target || 7, true, today_()]);
  return `🌱 Đã thêm thói quen “${name}” (mục tiêu ${target || 7} lần/tuần).\nKhi làm xong chỉ cần nhắn “${name.toLowerCase()}”.`;
}

/** Tìm thói quen có tên nằm trong câu (so khớp không dấu, ưu tiên tên dài nhất). */
function matchHabit_(text) {
  const t = ' ' + fold_(text) + ' ';
  let best = null;
  for (const h of habits_()) {
    const n = fold_(h.name);
    if (t.includes(' ' + n + ' ') && (!best || n.length > fold_(best.name).length)) best = h;
  }
  return best;
}

function habitLogs_() {
  return rows_(SHEETS.HABIT_LOG).map(r => ({ date: dayKey_(r.values[0]), habit: String(r.values[1]), row: r.row }));
}

function logHabit_(habitName, note, date) {
  date = date || today_();
  const done = habitLogs_().some(l => l.date === date && fold_(l.habit) === fold_(habitName));
  if (!done) sheet_(SHEETS.HABIT_LOG).appendRow([date, habitName, note || '', nowStr_()]);
  const st = habitStats_(habitName);
  return (done ? `👌 “${habitName}” đã được ghi cho ngày ${prettyDate_(date)} rồi.` : `🔥 Đã check “${habitName}”!`) +
    `\nChuỗi: ${st.streak} ngày | Tuần này: ${st.week}/${st.target}`;
}

/** Bật/tắt check một ngày (dùng cho web app). */
function toggleHabit_(habitName, date) {
  const log = habitLogs_().find(l => l.date === date && fold_(l.habit) === fold_(habitName));
  if (log) sheet_(SHEETS.HABIT_LOG).deleteRow(log.row);
  else sheet_(SHEETS.HABIT_LOG).appendRow([date, habitName, '', nowStr_()]);
  return !log;
}

function habitStats_(habitName, logs) {
  const h = habits_().find(x => fold_(x.name) === fold_(habitName)) || { target: 7 };
  const days = new Set((logs || habitLogs_()).filter(l => fold_(l.habit) === fold_(habitName)).map(l => l.date));
  const t = today_();
  // Chuỗi tính tới hôm nay; nếu hôm nay chưa làm thì tính tới hôm qua (chưa “gãy”).
  let cur = days.has(t) ? t : addDays_(t, -1), streak = 0;
  while (days.has(cur)) { streak++; cur = addDays_(cur, -1); }
  const ws = weekStart_(t);
  let week = 0;
  for (let d = ws; d <= t; d = addDays_(d, 1)) if (days.has(d)) week++;
  return { streak, week, target: h.target, doneToday: days.has(t), days };
}

function habitReport_() {
  const list = habits_();
  if (!list.length) return 'Chưa có thói quen nào. Thêm bằng: /habit_add Đọc sách 5';
  const logs = habitLogs_();
  const t = today_();
  const lines = list.map(h => {
    const st = habitStats_(h.name, logs);
    let dots = '';
    for (let i = 6; i >= 0; i--) dots += st.days.has(addDays_(t, -i)) ? '🟩' : '⬜';
    return `${st.doneToday ? '✅' : '▫️'} ${h.name}\n   ${dots}  chuỗi ${st.streak} · tuần ${st.week}/${st.target}`;
  });
  return '🌱 Thói quen (7 ngày gần nhất)\n' + lines.join('\n');
}


// ===================== Tasks.gs =====================

/** Công việc: todo -> doing -> done. Hỗ trợ #dự_án và hạn (hôm nay, mai, 25/10). */

function tasks_(includeDone) {
  return rows_(SHEETS.TASKS)
    .map(r => ({
      id: Number(r.values[0]), title: String(r.values[1]), status: String(r.values[2] || TASK_STATUS.TODO),
      due: dayKey_(r.values[3]), project: String(r.values[4] || ''), row: r.row,
    }))
    .filter(t => t.id && (includeDone || t.status !== TASK_STATUS.DONE));
}

/** Tách hạn chót và #dự án khỏi tiêu đề. */
function parseTaskText_(text) {
  let title = ' ' + String(text).trim() + ' ';
  let project = '';
  const p = title.match(/\s#([\p{L}\d_\-]+)/u);
  if (p) { project = p[1]; title = title.replace(p[0], ' '); }
  const d = extractDue_(title);
  return { title: capitalize_(d.text), due: d.due, project };
}

function addTask_(text, dueOverride) {
  const { title, due, project } = parseTaskText_(text);
  if (!title) return 'Cú pháp: /todo <việc cần làm> [hôm nay|mai|25/10] [#dự_án]';
  const all = tasks_(true);
  const id = all.reduce((mx, t) => Math.max(mx, t.id), 0) + 1;
  const finalDue = dueOverride || due;
  sheet_(SHEETS.TASKS).appendRow([id, title, TASK_STATUS.TODO, finalDue, project, today_(), '']);
  return `📝 #${id} ${title}` + (finalDue ? ` · hạn ${prettyDate_(finalDue)}` : '') + (project ? ` · #${project}` : '') +
    `\nXong thì gõ /done ${id}`;
}

function setTaskStatus_(id, status) {
  const task = tasks_(true).find(t => t.id === Number(id));
  if (!task) return `Không tìm thấy việc #${id}.`;
  const sh = sheet_(SHEETS.TASKS);
  sh.getRange(task.row, 3).setValue(status);
  sh.getRange(task.row, 7).setValue(status === TASK_STATUS.DONE ? today_() : '');
  const icon = { todo: '↩️', doing: '⏳', done: '🎉' }[status];
  return `${icon} #${task.id} ${task.title} → ${status}`;
}

function taskLine_(t) {
  const today = today_();
  const flag = t.due && t.due < today ? '🔴' : t.due === today ? '🟠' : t.status === TASK_STATUS.DOING ? '⏳' : '▫️';
  return `${flag} #${t.id} ${t.title}` + (t.due ? ` · ${prettyDate_(t.due)}` : '') + (t.project ? ` · #${t.project}` : '');
}

function sortTasks_(list) {
  const rank = { doing: 0, todo: 1, done: 2 };
  return list.sort((a, b) => (rank[a.status] - rank[b.status]) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1) || a.id - b.id);
}

function taskReport_() {
  const list = sortTasks_(tasks_(false));
  if (!list.length) return '🎯 Không còn việc nào đang mở. Thêm bằng: /todo Gửi báo cáo mai #work';
  return `🎯 Việc đang mở (${list.length})\n` + list.map(taskLine_).join('\n') +
    '\n\n🔴 quá hạn · 🟠 hôm nay · ⏳ đang làm';
}


// ===================== Leads.gs =====================

/**
 * Lead tracking cho Account Manager.
 * Mỗi lead có: giai đoạn, giá trị, next action + hạn, lần liên hệ cuối. Lịch sử liên hệ ở sheet LeadLog.
 * Bot nhắc mỗi sáng: lead quá hạn / đến hạn hôm nay / chưa có next action / lâu chưa liên hệ.
 */

const LC = { ID: 0, NAME: 1, CONTACT: 2, STAGE: 3, VALUE: 4, NEXT: 5, DUE: 6, SOURCE: 7, NOTE: 8,
  CREATED: 9, LAST: 10, UPDATED: 11, LOST: 12 };

// ---------- Giai đoạn ----------

function stageByKey_(key) { return LEAD_STAGES.find(s => s.key === key) || LEAD_STAGES[0]; }

/** Nhận key, nhãn hoặc cách gõ tắt (“bao gia”, “demo”…). Trả về key hoặc ''. */
function stageKey_(text) {
  const f = fold_(text);
  if (!f) return '';
  const hit = LEAD_STAGES.find(s => s.key === f || fold_(s.label) === f || s.alias.indexOf(f) >= 0);
  return hit ? hit.key : '';
}

// ---------- Đọc dữ liệu ----------

function leadFromRow_(r) {
  const v = r.values, t = today_();
  const stage = stageKey_(v[LC.STAGE]) || 'new';
  const last = dayKey_(v[LC.LAST]) || dayKey_(v[LC.CREATED]);
  const lead = {
    id: Number(v[LC.ID]), name: String(v[LC.NAME]), contact: String(v[LC.CONTACT] || ''),
    stage, stageLabel: stageByKey_(stage).label, value: Number(v[LC.VALUE]) || 0,
    next: String(v[LC.NEXT] || ''), due: dayKey_(v[LC.DUE]), source: String(v[LC.SOURCE] || ''),
    note: String(v[LC.NOTE] || ''), created: dayKey_(v[LC.CREATED]), lastContact: last,
    lostReason: String(v[LC.LOST] || ''), row: r.row,
  };
  lead.closed = LEAD_CLOSED.indexOf(stage) >= 0;
  lead.daysSince = last ? Math.round((new Date(t + 'T12:00:00Z') - new Date(last + 'T12:00:00Z')) / 86400000) : 0;
  lead.state = lead.closed ? 'closed' : !lead.next && !lead.due ? 'none'
    : !lead.due ? 'none' : lead.due < t ? 'overdue' : lead.due === t ? 'today' : 'upcoming';
  lead.stale = !lead.closed && lead.daysSince >= STALE_DAYS;
  return lead;
}

function leads_(includeClosed) {
  return rows_(SHEETS.LEADS).filter(r => r.values[LC.ID] && r.values[LC.NAME])
    .map(leadFromRow_).filter(l => includeClosed || !l.closed);
}

/** Tìm theo ID hoặc một phần tên. Trả về {lead} hoặc {error}. */
function resolveLead_(ref) {
  ref = String(ref || '').trim().replace(/^#/, '');
  if (!ref) return { error: 'Cho mình biết lead nào nhé: ID (vd. 3) hoặc một phần tên.' };
  const all = leads_(true);
  if (/^\d+$/.test(ref)) {
    const l = all.find(x => x.id === Number(ref));
    return l ? { lead: l } : { error: `Không thấy lead #${ref}. Xem /leads` };
  }
  const f = fold_(ref);
  const hits = all.filter(l => fold_(l.name).indexOf(f) >= 0);
  const open = hits.filter(l => !l.closed);
  const pick = open.length ? open : hits;
  if (pick.length === 1) return { lead: pick[0] };
  if (!pick.length) return { error: `Không thấy lead nào tên “${ref}”. Xem /leads` };
  return { error: 'Có nhiều lead khớp, dùng ID nhé:\n' + pick.slice(0, 8).map(l => `#${l.id} ${l.name}`).join('\n') };
}

/**
 * Tách “3 gọi lại thứ 6” hoặc “beta gọi lại thứ 6” thành lead + phần còn lại.
 * Với tên: lấy số từ ít nhất đủ để chỉ khớp đúng 1 lead (“beta” khớp Beta Ltd thì phần còn lại là việc tiếp theo).
 * Có dấu “|” hoặc “:” thì phần trước là tên.
 */
function splitLeadRef_(arg) {
  arg = String(arg || '').trim();
  const m = arg.match(/^#?(\d+)(?:\s+([\s\S]*))?$/);
  if (m) return { ref: m[1], rest: (m[2] || '').trim() };
  const piped = arg.match(/^([^|:]+?)\s*[|:]\s*([\s\S]*)$/);
  if (piped) return { ref: piped[1].trim(), rest: piped[2].trim() };
  const words = arg.split(/\s+/), all = leads_(true);
  for (let k = 1; k <= Math.min(words.length, 6); k++) {
    const f = fold_(words.slice(0, k).join(' '));
    const hits = all.filter(l => fold_(l.name).indexOf(f) >= 0);
    if (hits.length === 1) return { ref: words.slice(0, k).join(' '), rest: words.slice(k).join(' ') };
    if (!hits.length) break;
  }
  return { ref: arg, rest: '' };
}

// ---------- Ghi dữ liệu ----------

function nextLeadId_() {
  return leads_(true).reduce((mx, l) => Math.max(mx, l.id), 0) + 1;
}

function setLeadCells_(lead, cells) {
  const sh = sheet_(SHEETS.LEADS);
  Object.keys(cells).forEach(k => sh.getRange(lead.row, Number(k) + 1).setValue(cells[k]));
  sh.getRange(lead.row, LC.UPDATED + 1).setValue(nowStr_());
}

function parseValue_(v) {
  if (typeof v === 'number') return v;
  v = String(v || '').trim();
  if (!v) return 0;
  const a = parseAmount_(v);
  return a ? a.amount : 0;
}

/** “ABC Corp | 50tr | gửi báo giá thứ 6 | @chị Mai” -> các trường lead. */
function parseLeadText_(text) {
  const parts = String(text || '').split(/\s*(?:\||;|\s-\s)\s*/).map(s => s.trim()).filter(Boolean);
  const lead = { name: '', contact: '', value: 0, next: '', due: '', stage: '', source: '', note: '' };
  parts.forEach((seg, i) => {
    if (i === 0) {
      const am = parseAmount_(seg);
      if (am && am.hasUnit && am.rest) { lead.value = am.amount; seg = am.rest; }
      lead.name = capitalize_(seg);
      return;
    }
    const st = stageKey_(seg);
    if (st) { lead.stage = st; return; }
    const am = parseAmount_(seg);
    if (am && am.hasUnit && !am.rest) { lead.value = am.amount; return; }
    let m;
    if ((m = seg.match(/^@\s*(.+)$/)) || (m = seg.match(/^(?:liên hệ|lh|contact)\s*[:\-]?\s*(.+)$/i))) { lead.contact = m[1].trim(); return; }
    if ((m = seg.match(/^(?:nguồn|source)\s*[:\-]?\s*(.+)$/i))) { lead.source = m[1].trim(); return; }
    if ((m = seg.match(/^(?:ghi chú|note)\s*[:\-]?\s*(.+)$/i))) { lead.note = m[1].trim(); return; }
    const d = extractDue_(seg);
    if (d.due) { lead.due = d.due; if (d.text && !lead.next) lead.next = capitalize_(d.text); return; }
    if (!lead.next) lead.next = capitalize_(seg); else lead.note = (lead.note ? lead.note + '; ' : '') + seg;
  });
  return lead;
}

/** Thêm lead mới từ object (web app / AI) hoặc đã parse. */
function createLead_(f) {
  const name = String(f.name || '').trim();
  if (!name) return { error: 'Thiếu tên lead.' };
  const dup = leads_(false).find(l => fold_(l.name) === fold_(name));
  if (dup) return { error: `Lead “${dup.name}” đã có (#${dup.id}). Dùng /next ${dup.id} <việc tiếp theo> để cập nhật.` };
  const id = nextLeadId_();
  const stage = stageByKey_(f.stage || 'new');
  sheet_(SHEETS.LEADS).appendRow([id, capitalize_(name), f.contact || '', stage.label, parseValue_(f.value),
    f.next || '', f.due || '', f.source || '', f.note || '', today_(), today_(), nowStr_(), '']);
  return { id };
}

function leadSummaryLine_(l) {
  return `#${l.id} ${l.name}` + (l.value ? ` · ${money_(l.value)}` : '') + ` · ${l.stageLabel}`;
}

function addLead_(text) {
  const f = parseLeadText_(text);
  if (!f.name) return 'Cú pháp: /lead Tên | giá trị | việc tiếp theo | hạn | @người liên hệ\n' +
    'Ví dụ: /lead ABC Corp | 50tr | gửi báo giá | thứ 6 | @chị Mai';
  const r = createLead_(f);
  return r.error ? r.error : addLeadReply_(r.id);
}

function addLeadReply_(id) {
  const l = leads_(true).find(x => x.id === id);
  return `🐟 Đã thêm lead ${leadSummaryLine_(l)}` +
    (l.next ? `\n➜ ${l.next}` + (l.due ? ` · ${dueLabel_(l.due)}` : '') : '') +
    (!l.next || !l.due ? `\n⚪ Chưa đủ next action + hạn. Đặt bằng: /next ${l.id} gọi lại thứ 6` : '');
}

/** Đặt next action. Thiếu hạn thì mặc định ngày mai (lead không có hạn thì không nhắc được). */
function setNextAction_(ref, text) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const d = extractDue_(text);
  if (!d.text && !d.due) return `Cú pháp: /next ${r.lead.id} <việc tiếp theo> [hạn]\nVí dụ: /next ${r.lead.id} gửi báo giá thứ 6`;
  const defaulted = !d.due;
  const due = d.due || addDays_(today_(), 1);
  const next = d.text ? capitalize_(d.text) : r.lead.next;
  setLeadCells_(r.lead, { [LC.NEXT]: next, [LC.DUE]: due });
  return `➜ #${r.lead.id} ${r.lead.name}: ${next} · ${dueLabel_(due)} (${prettyDate_(due)})` +
    (defaulted ? '\n(Không thấy hạn nên đặt ngày mai. Đổi: /next ' + r.lead.id + ' ' + next + ' 25/10)' : '');
}

function appendLeadLog_(lead, note) {
  sheet_(SHEETS.LEAD_LOG).appendRow([today_(), lead.id, lead.name, note, nowStr_()]);
}

/** Ghi 1 lần liên hệ; có thể kèm next action sau dấu “|”. */
function logLeadContact_(ref, text, nextText) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const l = r.lead;
  let note = String(text || '').trim(), next = nextText;
  if (next == null && note.indexOf('|') >= 0) { const p = note.split('|'); note = p[0].trim(); next = p.slice(1).join('|').trim(); }
  if (!note && !next) return `Cú pháp: /log ${l.id} <đã trao đổi gì> | <việc tiếp theo> [hạn]`;
  if (note) appendLeadLog_(l, note);
  setLeadCells_(l, { [LC.LAST]: today_() });
  let out = `📞 Đã ghi liên hệ với ${l.name}` + (note ? `: ${note}` : '');
  if (next) out += '\n' + setNextAction_(l.id, next);
  else if (!l.closed) out += `\nĐừng quên đặt next action: /next ${l.id} gửi báo giá thứ 6`;
  return out;
}

function setLeadStage_(ref, stageText, reason) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const key = stageKey_(stageText);
  if (!key) return 'Giai đoạn: ' + LEAD_STAGES.map(s => s.label).join(' → ');
  const st = stageByKey_(key), cells = { [LC.STAGE]: st.label };
  if (key === 'lost') cells[LC.LOST] = reason || '';
  if (LEAD_CLOSED.indexOf(key) >= 0) { cells[LC.NEXT] = ''; cells[LC.DUE] = ''; }
  setLeadCells_(r.lead, cells);
  const l = r.lead;
  if (key === 'won') return `🎉🐱 Chốt được ${l.name}${l.value ? ' · ' + money_(l.value) : ''}! Giỏi quá meo!`;
  if (key === 'lost') return `😿 Đã đóng ${l.name} (thua)${reason ? ': ' + reason : ''}`;
  return `🐟 #${l.id} ${l.name} → ${st.label}`;
}

function snoozeLead_(ref, days) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const n = Number(days) || 1, t = today_();
  const base = r.lead.due && r.lead.due > t ? r.lead.due : t;
  const due = addDays_(base, n);
  setLeadCells_(r.lead, { [LC.DUE]: due, [LC.NEXT]: r.lead.next || 'Follow-up' });
  return `⏰ Dời #${r.lead.id} ${r.lead.name} sang ${dueLabel_(due)} (${prettyDate_(due)})`;
}

function leadHistory_(id) {
  return rows_(SHEETS.LEAD_LOG).filter(r => Number(r.values[1]) === Number(id))
    .map(r => ({ date: dayKey_(r.values[0]), note: String(r.values[3]) })).reverse().slice(0, 5);
}

// ---------- Báo cáo & nhắc nhở ----------

function sortLeads_(list) {
  const rank = { overdue: 0, today: 1, upcoming: 2, none: 3, closed: 4 };
  return list.sort((a, b) => (rank[a.state] - rank[b.state]) || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0) || b.value - a.value);
}

function leadFlag_(l) {
  return l.state === 'overdue' ? '🔴' : l.state === 'today' ? '🟠' : l.state === 'none' ? '⚪' : l.stale ? '🟡' : '🟢';
}

function leadLine_(l) {
  let s = `${leadFlag_(l)} #${l.id} ${l.name}` + (l.value ? ` · ${money_(l.value)}` : '') + ` · ${l.stageLabel}`;
  s += l.next ? `\n    ➜ ${l.next}${l.due ? ' · ' + dueLabel_(l.due) : ''}` : '\n    ➜ chưa có next action';
  if (l.stale) s += `\n    🟡 ${l.daysSince} ngày chưa liên hệ`;
  return s;
}

function leadReport_(filter) {
  let list = leads_(false);
  const f = String(filter || '').trim();
  if (f) { const ff = fold_(f); list = list.filter(l => fold_(l.name).indexOf(ff) >= 0 || fold_(l.stageLabel).indexOf(ff) >= 0); }
  if (!list.length) return f ? `Không có lead nào khớp “${f}”.` : '🐟 Chưa có lead nào. Thêm: /lead ABC Corp | 50tr | gửi báo giá | thứ 6';
  list = sortLeads_(list);
  const total = list.reduce((s, l) => s + l.value, 0);
  return `🐟 Lead đang mở (${list.length}) · ${money_(total)}\n\n` + list.map(leadLine_).join('\n') +
    '\n\n🔴 quá hạn · 🟠 hôm nay · ⚪ thiếu next action · 🟡 nguội · 🟢 ổn';
}

function pipelineReport_() {
  const all = leads_(true), open = all.filter(l => !l.closed);
  if (!all.length) return 'Chưa có lead nào. Thêm: /lead ABC Corp | 50tr | gửi báo giá | thứ 6';
  const lines = LEAD_STAGES.filter(s => LEAD_CLOSED.indexOf(s.key) < 0).map(s => {
    const x = open.filter(l => l.stage === s.key);
    return `${s.label}: ${x.length} lead` + (x.length ? ` · ${money_(x.reduce((a, l) => a + l.value, 0))}` : '');
  });
  const m = monthStart_(today_());
  const wonM = all.filter(l => l.stage === 'won' && dayKey_(l.lastContact) >= m);
  return `📊 Phễu bán hàng\n${lines.join('\n')}\n\nĐang mở: ${open.length} · ${money_(open.reduce((a, l) => a + l.value, 0))}` +
    `\n🎉 Đã chốt tháng này: ${wonM.length} · ${money_(wonM.reduce((a, l) => a + l.value, 0))}` +
    `\n🟡 Lead nguội (≥${STALE_DAYS} ngày): ${open.filter(l => l.stale).length}`;
}

/** Gom các lead cần chú ý để nhắc. */
function leadAttention_() {
  const open = leads_(false);
  const hot = l => l.state === 'overdue' || l.state === 'today';
  return {
    overdue: sortLeads_(open.filter(l => l.state === 'overdue')),
    today: sortLeads_(open.filter(l => l.state === 'today')),
    none: open.filter(l => l.state === 'none'),
    stale: open.filter(l => l.stale && !hot(l) && l.state !== 'none'),
  };
}

function leadAttentionText_() {
  const a = leadAttention_(), out = [];
  const short = l => `• #${l.id} ${l.name}${l.value ? ' (' + money_(l.value) + ')' : ''}: ${l.next || '—'}` + (l.state === 'overdue' ? ` · ${dueLabel_(l.due)}` : '');
  if (a.overdue.length) out.push(`🔴 Lead quá hạn (${a.overdue.length})\n` + a.overdue.map(short).join('\n'));
  if (a.today.length) out.push(`🟠 Cần làm hôm nay (${a.today.length})\n` + a.today.map(short).join('\n'));
  if (a.none.length) out.push(`⚪ Chưa có next action (${a.none.length}): ` + a.none.map(l => `#${l.id} ${l.name}`).join(', '));
  if (a.stale.length) out.push(`🟡 Lâu chưa liên hệ (${a.stale.length}): ` + a.stale.map(l => `#${l.id} ${l.name} (${l.daysSince}n)`).join(', '));
  return out.join('\n\n');
}


// ===================== AI.gs =====================

/**
 * AI qua Gemini API (free tier của Google AI Studio). Không bắt buộc:
 * thiếu GEMINI_API_KEY thì bot vẫn chạy bằng parser quy tắc, chỉ mất voice + hiểu câu tự do.
 * Đổi model bằng Script Property GEMINI_MODEL (vd. gemini-2.0-flash, gemini-2.5-flash-lite).
 */

function aiEnabled_() {
  return !!prop_('GEMINI_API_KEY');
}

function gemini_(parts, asJson) {
  const key = prop_('GEMINI_API_KEY');
  if (!key) return null;
  const model = prop_('GEMINI_MODEL') || 'gemini-2.5-flash';
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
    console.error('Gemini error', res.getResponseCode(), res.getContentText());
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


// ===================== Telegram.gs =====================

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
  const key = prop_('WEB_KEY');
  if (!key) return null;
  const pages = (prop_('PAGES_URL') || '').trim();
  const api = (prop_('WEB_APP_URL') || '').trim();
  // Hash (#...) không bao giờ gửi lên server nên key không lộ qua log của GitHub.
  if (pages && api) return `${pages}#key=${encodeURIComponent(key)}&api=${encodeURIComponent(api)}`;
  return api ? `${api}?key=${encodeURIComponent(key)}` : null;
}


// ===================== Router.gs =====================

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


// ===================== WebApi.gs =====================

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
    tasks: sortTasks_(tasks_(false)).map(x => ({ id: x.id, title: x.title, status: x.status, due: x.due, project: x.project })),
    leads: sortLeads_(leads_(false)).map(apiLead_),
    stages: LEAD_STAGES.map(s => ({ key: s.key, label: s.label })),
    staleDays: STALE_DAYS,
  };
}

function apiLead_(l) {
  return { id: l.id, name: l.name, contact: l.contact, stage: l.stage, stageLabel: l.stageLabel, value: l.value,
    next: l.next, due: l.due, source: l.source, note: l.note, lastContact: l.lastContact,
    daysSince: l.daysSince, state: l.state, stale: l.stale };
}

function api_quickAdd(key, text) {
  auth_(key);
  return handleText_(text, 'web');
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

function api_leadHistory(key, id) {
  auth_(key);
  return leadHistory_(id);
}

// ---------- API JSON cho web app host ngoài (GitHub Pages) ----------

const API_FUNCTIONS = {
  dashboard: api_dashboard,
  quickAdd: api_quickAdd,
  toggleHabit: api_toggleHabit,
  addHabit: api_addHabit,
  addTask: api_addTask,
  setTask: api_setTask,
  leadSave: api_leadSave,
  leadLog: api_leadLog,
  leadStage: api_leadStage,
  leadSnooze: api_leadSnooze,
  leadHistory: api_leadHistory,
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


// ===================== Code.gs =====================

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
    { command: 'leads', description: 'Danh sách lead đang mở' },
    { command: 'lead', description: 'Thêm lead: /lead ABC | 50tr | gửi báo giá | thứ 6' },
    { command: 'log', description: 'Ghi liên hệ: /log 3 đã gọi | gửi HĐ mai' },
    { command: 'next', description: 'Đặt next action: /next 3 họp demo 25/10' },
    { command: 'pipeline', description: 'Phễu bán hàng' },
    { command: 'done', description: 'Hoàn thành việc: /done 3' },
    { command: 'app', description: 'Mở web app' },
    { command: 'help', description: 'Hướng dẫn' },
  ] });
  console.log(JSON.stringify(r));
  console.log(JSON.stringify(tg_('getWebhookInfo')));
}

/** Nhắc nhở: 8h sáng (lead, việc) và 21h tối (tổng kết ngày). Chạy lại được nhiều lần. */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['eveningReminder', 'morningReminder'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
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

