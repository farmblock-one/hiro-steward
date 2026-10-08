// Chạy: node test/parse.test.js — kiểm tra parser bằng cách giả lập vài API Apps Script.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = {
  console,
  Utilities: { formatDate: (d, tz, f) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d)
      .reduce((o, x) => (o[x.type] = x.value, o), {});
    return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
      .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
};
vm.createContext(ctx);
for (const f of ['Config.gs', 'Utils.gs', 'Finance.gs', 'Tasks.gs'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), ctx);
// const ở top-level không gắn vào context -> lấy qua runInContext
const run = s => vm.runInContext(s, ctx);
const amt = t => { const r = run(`parseAmount_(${JSON.stringify(t)})`); return r && r.amount; };

const cases = {
  'cafe 35k': 35000, 'cafe 35': 35000, 'ăn trưa 45 nghìn': 45000, 'tiền nhà 5tr': 5e6,
  'mua giày 1tr2': 1.2e6, 'laptop 25 triệu': 25e6, 'đổ xăng 80.000': 80000, 'grab 120,000đ': 120000,
  '1.5tr khóa học': 1.5e6, 'nhậu 3 lít': 300000, 'mua 2 mì gói 30k': 30000, 'bánh 1k5': 1500,
  'iphone 2 củ': 2e6, 'không có số': null,
};
for (const [t, want] of Object.entries(cases)) assert.strictEqual(amt(t), want, t);

assert.strictEqual(run(`parseAmount_('cafe 35k').rest`), 'cafe');
assert.strictEqual(run(`parseAmount_('đọc sách 30 trang').hasUnit`), false);
assert.strictEqual(run(`guessCategory_('cafe highlands')`), 'Ăn uống');
assert.strictEqual(run(`guessCategory_('tiền điện tháng 9')`), 'Nhà cửa');
assert.strictEqual(run(`guessCategory_('đổ xăng')`), 'Đi lại');
assert.strictEqual(run(`fold_('Tập Thể Dục')`), 'tap the duc');

const today = run('today_()');
const task = t => run(`parseTaskText_(${JSON.stringify(t)})`);
assert.deepStrictEqual({ ...task('gửi báo cáo mai #work') }, { title: 'Gửi báo cáo', due: run(`addDays_(today_(),1)`), project: 'work' });
assert.strictEqual(task('nộp thuế hôm nay').due, today);
assert.strictEqual(task('họp team 25/12').due.slice(5), '12-25');
assert.strictEqual(task('đặt vé tuần sau').due, run(`addDays_(weekStart_(today_()),7)`));
assert.strictEqual(run(`weekStart_('2026-10-08')`), '2026-10-05');
assert.strictEqual(run(`money_(1234567)`), '1.234.567đ');
console.log('All parser tests passed');
