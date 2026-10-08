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
  };
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

// ---------- API JSON cho web app host ngoài (GitHub Pages) ----------

const API_FUNCTIONS = {
  dashboard: api_dashboard,
  quickAdd: api_quickAdd,
  toggleHabit: api_toggleHabit,
  addHabit: api_addHabit,
  addTask: api_addTask,
  setTask: api_setTask,
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
