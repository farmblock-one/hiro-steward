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

/** “hôm qua cafe 35k” -> ghi 1 khoản chi. Trả về null nếu không thấy số tiền. */
function addExpenseText_(text, source) {
  const past = extractPastDay_(text);
  const parsed = parseAmount_(past.text);
  if (!parsed) return null;
  const category = guessCategory_(parsed.rest) || aiCategory_(parsed.rest) || DEFAULT_CATEGORY;
  return logExpense_({ amount: parsed.amount, category, desc: parsed.rest, source, raw: text, date: past.date });
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
