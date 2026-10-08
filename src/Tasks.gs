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
