// Chạy: node test/leads.test.js
const assert = require('assert');
const { load } = require('./harness');
const env = load(['Config.gs', 'Utils.gs', 'Finance.gs', 'Habits.gs', 'Tasks.gs', 'Leads.gs', 'AI.gs', 'Telegram.gs', 'Router.gs', 'WebApi.gs']);
const run = env.run;
const cmd = t => run(`handleCommand_(${JSON.stringify(t)})`);
const txt = t => run(`handleText_(${JSON.stringify(t)}, 'text')`);
const day = n => run(`addDays_(today_(), ${n})`);
const today = run('today_()');

// --- extractDue_ ---
const due = t => run(`extractDue_(${JSON.stringify(t)})`);
assert.strictEqual(due('gọi lại mai').due, day(1));
assert.strictEqual(due('gọi chị Mai').due, '', '“Mai” viết hoa là tên người');
assert.strictEqual(due('gửi hợp đồng ngày mốt').due, day(2));
assert.strictEqual(due('họp 3 ngày nữa').due, day(3));
assert.strictEqual(due('check sau 2 tuần').due, day(14));
const t6 = due('gửi báo giá thứ 6');
assert.ok(t6.due > today && t6.due <= day(7), 'thứ 6 là ngày sắp tới');
assert.strictEqual(new Date(t6.due + 'T12:00:00Z').getUTCDay(), 5);
assert.strictEqual(t6.text, 'gửi báo giá');
const t2n = due('họp thứ 2 tuần sau');
assert.strictEqual(new Date(t2n.due + 'T12:00:00Z').getUTCDay(), 1);
assert.ok(t2n.due > run('weekStart_(today_())') && t2n.due > today);
assert.strictEqual(t2n.text, 'họp');
assert.strictEqual(due('hạn 25/12 nộp hồ sơ').due.slice(5), '12-25');
assert.strictEqual(due('t7 gặp khách').text, 'gặp khách');
assert.strictEqual(due('31/13 abc').due, '');

// --- parseLeadText_ ---
const pl = t => run(`parseLeadText_(${JSON.stringify(t)})`);
let f = pl('ABC Corp | 50tr | gửi báo giá | thứ 6 | @chị Mai');
assert.strictEqual(f.name, 'ABC Corp'); assert.strictEqual(f.value, 50e6);
assert.strictEqual(f.next, 'Gửi báo giá'); assert.strictEqual(f.contact, 'chị Mai'); assert.ok(f.due);
f = pl('XYZ 1.5tr');
assert.strictEqual(f.name, 'XYZ'); assert.strictEqual(f.value, 1.5e6);
f = pl('Beta Ltd | gọi lại mai | demo');
assert.strictEqual(f.next, 'Gọi lại'); assert.strictEqual(f.due, day(1)); assert.strictEqual(f.stage, 'meeting');
f = pl('Gamma | báo giá | 200tr');
assert.strictEqual(f.stage, 'proposal'); assert.strictEqual(f.value, 200e6);

// --- luồng đầy đủ qua lệnh ---
let r = cmd('/lead ABC Corp | 50tr | gửi báo giá | mai | @chị Mai');
assert.ok(r.includes('Đã thêm lead #1 ABC Corp'), r); assert.ok(!r.includes('Chưa đủ'), r);
r = cmd('/lead ABC Corp | 10tr'); assert.ok(r.includes('đã có'), r);          // chặn trùng
r = txt('lead Beta Ltd | 20tr');
assert.ok(r.includes('#2 Beta Ltd') && r.includes('Chưa đủ next action'), r);
r = cmd('/next 2 họp demo thứ 6'); assert.ok(r.includes('Họp demo'), r);
r = cmd('/next beta gọi lại'); assert.ok(r.includes('đặt ngày mai'), r);        // tìm theo tên, thiếu hạn → mai
r = cmd('/log 1 đã gọi, khách quan tâm | gửi hợp đồng thứ 2 tuần sau');
assert.ok(r.includes('Đã ghi liên hệ với ABC Corp') && r.includes('Gửi hợp đồng'), r);
assert.strictEqual(env.sheets.LeadLog.data.length, 2); // header + 1 dòng
r = cmd('/snooze 1 3'); assert.ok(r.includes('Dời #1'), r);
r = cmd('/stage 1 báo giá'); assert.ok(r.includes('Báo giá'), r);
r = cmd('/leads'); assert.ok(r.includes('ABC Corp') && r.includes('Beta Ltd'), r);
r = cmd('/pipeline'); assert.ok(r.includes('Báo giá: 1 lead') && r.includes('Đang mở: 2'), r);
r = cmd('/next xyz gì đó'); assert.ok(r.includes('Không thấy lead'), r);

// quá hạn + nhắc nhở
const sh = env.sheets.Leads;
sh.data[1][6] = day(-2);                                  // ABC quá hạn 2 ngày
sh.data[2][6] = today;                                    // Beta hôm nay
const brief = run('morningBrief_()');
assert.ok(brief.includes('Lead quá hạn (1)') && brief.includes('quá hạn 2 ngày'), brief);
assert.ok(brief.includes('Cần làm hôm nay (1)'), brief);
sh.data[1][10] = day(-9);                                 // liên hệ cuối 9 ngày trước
sh.data[1][6] = day(5);
assert.ok(run('leadAttentionText_()').includes('Lâu chưa liên hệ (1)'));

r = cmd('/lost 2 giá cao'); assert.ok(r.includes('thua') && r.includes('giá cao'), r);
r = cmd('/won 1'); assert.ok(r.includes('Chốt được ABC Corp'), r);
assert.ok(cmd('/leads').includes('Chưa có lead'), 'đóng hết thì danh sách trống');
assert.ok(run('dailyDigest_()').includes('Lead: không có gì cần xử lý gấp'));

// --- API web ---
const api = (fn, ...a) => JSON.parse(run(`apiResponse_(${JSON.stringify(JSON.stringify({ key: 'K', fn, args: a }))})`).s);
assert.strictEqual(api('dashboard').ok, true);
assert.strictEqual(JSON.parse(run(`apiResponse_(${JSON.stringify(JSON.stringify({ key: 'BAD', fn: 'dashboard' }))})`).s).ok, false);
assert.strictEqual(api('hack').ok, false);
let saved = api('leadSave', { name: 'Delta Co', value: '30tr', next: 'Gọi', due: day(1), stage: 'contacted', contact: 'Anh Nam' });
assert.ok(saved.ok && saved.result.includes('Delta Co'), JSON.stringify(saved));
let dash = api('dashboard').result;
assert.strictEqual(dash.leads.length, 1); assert.strictEqual(dash.leads[0].value, 30e6);
assert.strictEqual(dash.leads[0].stageLabel, 'Đã liên hệ'); assert.strictEqual(dash.leads[0].state, 'upcoming');
const id = dash.leads[0].id;
assert.ok(api('leadLog', id, 'đã gọi', 'gửi báo giá', day(3)).ok);
dash = api('dashboard').result; assert.strictEqual(dash.leads[0].next, 'Gửi báo giá'); assert.strictEqual(dash.leads[0].due, day(3));
assert.strictEqual(api('leadHistory', id).result.length, 1);
assert.ok(api('leadSave', { id, value: '45tr', stage: 'proposal' }).ok);
assert.strictEqual(api('dashboard').result.leads[0].value, 45e6);
assert.ok(api('leadSnooze', id, 2).ok);
assert.ok(api('leadStage', id, 'won').ok); assert.strictEqual(api('dashboard').result.leads.length, 0);
assert.strictEqual(api('leadSave', { name: '' }).ok, false);

// --- endpoint riêng từng mục (web app) ---
let ex = api('addExpense', 'cafe 35k');
assert.ok(ex.ok && ex.result.includes('35.000đ') && ex.result.includes('Ăn uống'), JSON.stringify(ex));
assert.ok(api('addExpense', 'hôm qua grab 120k').result.includes('Đi lại'));
assert.strictEqual(api('addExpense', 'không có số tiền').ok, false);
assert.strictEqual(api('addExpense', 'đọc sách 30 trang').ok, true, 'khoản chi không bị nhầm sang thói quen');
assert.strictEqual(env.sheets.Expenses.data.length, 4); // header + 3
assert.ok(api('undoExpense').result.includes('Đã xoá'));
assert.strictEqual(env.sheets.Expenses.data.length, 3);
const al = api('addLeadText', 'Omega Ltd | 80tr | gọi demo | mai');
assert.ok(al.ok && al.result.includes('Omega Ltd'), JSON.stringify(al));
assert.strictEqual(api('addLeadText', 'Omega Ltd').ok, false, 'trùng tên bị chặn');
assert.strictEqual(api('addLeadText', '   ').ok, false);
assert.strictEqual(api('dashboard').result.leads.find(l => l.name === 'Omega Ltd').due, day(1));
console.log('All lead tests passed');
