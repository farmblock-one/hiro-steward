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
