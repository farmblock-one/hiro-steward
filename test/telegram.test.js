// Chạy: node test/telegram.test.js — chế độ polling và chuyển đổi webhook/polling.
const assert = require('assert');
const { load } = require('./harness');
const env = load(['Config.gs', 'Utils.gs', 'Finance.gs', 'Habits.gs', 'Tasks.gs', 'Leads.gs', 'Email.gs', 'AI.gs', 'Telegram.gs', 'Router.gs', 'WebApi.gs', 'Code.gs']);
const run = env.run, ctx = env.ctx, j = JSON.stringify;
env.props.TELEGRAM_TOKEN = 't'; env.props.ALLOWED_CHAT_ID = '1';
const sent = [], calls = [];
let queue = [];
env.setFetch((url, o) => {
  const method = url.split('/').pop();
  const body = o.payload ? JSON.parse(o.payload) : {};
  calls.push({ method, body });
  if (method === 'getUpdates') {
    const off = body.offset || 0;
    return { body: { ok: true, result: queue.filter(u => u.update_id >= off) } };
  }
  if (method === 'sendMessage') { sent.push(body.text); return { body: { ok: true } }; }
  return { body: { ok: true, result: {} } };
});
const upd = (id, text, chat = 1) => ({ update_id: id, message: { chat: { id: chat }, text } });

// Chưa bật polling thì không làm gì
queue = [upd(10, '/help')]; run('pollTelegram()');
assert.ok(!calls.some(c => c.method === 'getUpdates'), 'không polling khi chưa bật');

// usePolling: xoá webhook (bỏ tin cũ), đặt chế độ, bật trigger mỗi phút
run('usePolling()');
assert.ok(calls.some(c => c.method === 'deleteWebhook' && c.body.drop_pending_updates === true));
assert.strictEqual(env.props.TELEGRAM_MODE, 'poll');
assert.ok(ctx.ScriptApp._triggers.filter(t => t.fn === 'pollTelegram').length === 1);
run('usePolling()'); assert.strictEqual(ctx.ScriptApp._triggers.filter(t => t.fn === 'pollTelegram').length, 1, 'không nhân đôi trigger');

// Xử lý tin mới, mỗi tin đúng một lần, nhớ mốc
sent.length = 0; queue = [upd(100, '/help'), upd(101, 'cafe 35k')];
run('pollTelegram()');
assert.strictEqual(sent.length, 2, sent.join('|')); assert.ok(sent[0].includes('Hiro Steward') && sent[1].includes('35.000'));
assert.strictEqual(env.props.TG_OFFSET, '102');
sent.length = 0; run('pollTelegram()');
assert.strictEqual(sent.length, 0, 'lượt sau không xử lý lại tin cũ');
assert.strictEqual(env.props.TG_POLL_BUSY, '0');

// Tin mới đến sau đó vẫn được lấy; người lạ bị bỏ qua
queue = queue.concat([upd(102, '/today'), upd(103, '/help', 999)]);
run('pollTelegram()');
assert.strictEqual(sent.length, 1, 'chỉ trả lời chat được phép'); assert.ok(sent[0].includes('📅'));
assert.strictEqual(env.props.TG_OFFSET, '104');

// Lệnh lỗi: báo ⚠️ và không bị xử lý lại
const realNew = ctx.ScriptApp.newTrigger; ctx.ScriptApp.newTrigger = () => { throw new Error('boom'); };
env.props.EMAIL_ENABLED = '1'; sent.length = 0; queue.push(upd(104, '/email'));
run('pollTelegram()');
assert.ok(sent.length === 1 && sent[0].includes('⚠️') && sent[0].includes('boom'), sent.join('|'));
ctx.ScriptApp.newTrigger = realNew; sent.length = 0; run('pollTelegram()'); assert.strictEqual(sent.length, 0, 'lệnh lỗi không bị lặp');

// Đang bận (lượt trước chưa xong) thì bỏ qua lượt này
env.props.TG_POLL_BUSY = String(Date.now()); queue.push(upd(105, '/help')); sent.length = 0; run('pollTelegram()');
assert.strictEqual(sent.length, 0, 'không chạy chồng'); env.props.TG_POLL_BUSY = '0'; run('pollTelegram()'); assert.strictEqual(sent.length, 1);

// Quay lại webhook: bỏ trigger polling, đặt chế độ webhook
env.props.WEB_APP_URL = 'https://script.google.com/macros/s/X/exec'; env.props.WEBHOOK_SECRET = 'sec';
run('setWebhook()');
assert.strictEqual(env.props.TELEGRAM_MODE, 'webhook'); assert.ok(!ctx.ScriptApp._triggers.some(t => t.fn === 'pollTelegram'));
assert.ok(calls.some(c => c.method === 'setWebhook'));
sent.length = 0; queue.push(upd(106, '/help')); run('pollTelegram()'); assert.strictEqual(sent.length, 0, 'webhook mode thì polling tự tắt');
console.log('All telegram tests passed');
