// Chạy: node test/tasks.test.js — Gemini là đồ giả, không có mạng thật.
const assert = require('assert');
const { load } = require('./harness');
const env = load(['Config.gs', 'Utils.gs', 'Finance.gs', 'Habits.gs', 'Tasks.gs', 'Leads.gs', 'Email.gs', 'AI.gs', 'Telegram.gs', 'Router.gs', 'WebApi.gs', 'Code.gs']);
const run = env.run, j = x => JSON.stringify(x), K = 'K';
const today = run('today_()'), day = n => run(`addDays_(today_(), ${n})`);

// Quy tắc (không AI)
const p = t => run(`parseTaskText_(${j(t)})`);
assert.strictEqual(p('gửi báo giá mai gấp #abc').priority, 'high');
assert.strictEqual(p('gửi báo giá mai gấp #abc').title, 'Gửi báo giá');
assert.strictEqual(p('dọn kho khi rảnh').priority, 'low');
assert.strictEqual(p('họp team').priority, '');
assert.strictEqual(p('việc này không gấp').priority, 'low');

// api_parseTask không có key AI -> dùng quy tắc, priority mặc định vừa
let r = run(`api_parseTask(${j(K)}, 'Gọi khách mai #abc')`);
assert.deepStrictEqual([r.title, r.project, r.due, r.priority, r.ai], ['Gọi khách', 'abc', day(1), 'medium', false]);

// Có AI (giả)
env.props.GEMINI_API_KEY = 'g';
let fetched = [], reply;
env.setFetch((url, o) => { fetched.push({ url, body: JSON.parse(o.payload) }); return { body: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] } }; });
run(`createTask_({ title: 'Phun thuốc lô trên', project: 'Vườn Cầu Giấy', due: '', priority: 'low' })`);
reply = { title: 'phun thuốc rỉ sắt lô dưới', project: 'vườn cầu giấy', due: day(2), priority: 'high' };
r = run(`api_parseTask(${j(K)}, 'Phun thuốc rỉ sắt lô dưới thứ năm gấp')`);
assert.deepStrictEqual([r.title, r.project, r.due, r.priority, r.ai], ['Phun thuốc rỉ sắt lô dưới', 'Vườn Cầu Giấy', day(2), 'high', true], 'dự án khớp tên cũ, không đẻ biến thể');
assert.ok(fetched[0].url.includes('gemini-flash-lite-latest'), 'dùng model nhẹ cho việc');
assert.ok(JSON.stringify(fetched[0].body).includes('Vườn Cầu Giấy'), 'AI được biết danh sách dự án');

// Kết quả AI bậy bị ép về đúng kiểu
reply = { title: 'x'.repeat(500), project: 'abc.com', due: '2001-01-01', priority: 'siêu khẩn' };
r = run(`api_parseTask(${j(K)}, 'abc')`);
assert.ok(r.title.length <= 200 && r.project === '' && r.due === '' && r.priority === 'medium');

// AI lỗi -> rơi về quy tắc, vẫn dùng được
env.setFetch(() => ({ code: 429, body: { error: { message: 'quota' } } }));
r = run(`api_parseTask(${j(K)}, 'Nộp thuế mai')`);
assert.deepStrictEqual([r.title, r.due, r.ai], ['Nộp thuế', day(1), false]); assert.ok(r.aiError.includes('429'));

// Giọng nói: 1 lần gọi, có transcript, audio đi kèm
reply = { transcript: 'Tưới nước khu A ngày mai', title: 'Tưới nước khu A', project: 'Khu A', due: day(1), priority: 'medium' };
fetched = []; env.setFetch((url, o) => { fetched.push(JSON.parse(o.payload)); return { body: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] } }; });
r = run(`api_parseTaskAudio(${j(K)}, 'QUJD', 'audio/webm;codecs=opus')`);
assert.strictEqual(r.text, 'Tưới nước khu A ngày mai'); assert.strictEqual(fetched.length, 1);
assert.strictEqual(fetched[0].contents[0].parts[1].inlineData.mimeType, 'audio/webm');
assert.throws(() => run(`api_parseTaskAudio('bad', 'QUJD', 'audio/webm')`), /Unauthorized/);

// Lưu + dashboard + sắp xếp
const msg = run(`api_saveTask(${j(K)}, { title: 'nộp hồ sơ', project: '#Thuế', due: '${day(0)}', priority: 'high' })`);
assert.ok(msg.includes('Cao') && msg.includes('#Thuế'));
assert.throws(() => run(`api_saveTask(${j(K)}, { title: '  ' })`), /Thiếu/);
const dash = run(`api_dashboard(${j(K)})`);
assert.strictEqual(dash.tasks[0].title, 'Nộp hồ sơ'); assert.strictEqual(dash.tasks[0].priority, 'high');
assert.ok(dash.projects.includes('Thuế') && dash.aiTasks);
// Dòng cũ 7 cột (chưa có ưu tiên) vẫn đọc được
env.sheets.Tasks.data.push([99, 'Việc cũ', 'todo', '', '', '2026-01-01', '']);
assert.strictEqual(run('tasks_(false)').find(t => t.id === 99).priority, 'medium');
// Telegram /todo với AI: điền chỗ trống
reply = { title: 'Gọi chị Mai', project: 'ABC', due: day(3), priority: 'high' };
const t = run(`handleCommand_('/todo gọi chị Mai')`);
assert.ok(t.includes('#ABC') && t.includes('Cao'), t);
console.log('All task tests passed');
