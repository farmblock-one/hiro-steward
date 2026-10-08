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
