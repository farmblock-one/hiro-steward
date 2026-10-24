/** Công việc: todo -> doing -> done. Hỗ trợ #dự_án và hạn (hôm nay, mai, 25/10). */

function tasks_(includeDone) {
  return rows_(SHEETS.TASKS)
    .map(r => ({
      id: Number(r.values[0]), title: String(r.values[1]), status: String(r.values[2] || TASK_STATUS.TODO),
      due: dayKey_(r.values[3]), project: String(r.values[4] || ''), priority: priorityKey_(r.values[7]) || 'medium', row: r.row,
    }))
    .filter(t => t.id && (includeDone || t.status !== TASK_STATUS.DONE));
}

function priorityKey_(v) {
  const k = fold_(v);
  const hit = TASK_PRIORITIES.find(p => p.key === k || fold_(p.label) === k);
  return hit ? hit.key : '';
}
const priorityOf_ = key => TASK_PRIORITIES.find(p => p.key === key) || TASK_PRIORITIES[1];

const PRIORITY_LOW_RE = /(?<![\p{L}\d])(?:không gấp|khong gap|từ từ|khi rảnh|ưu tiên thấp)(?![\p{L}\d])/iu;
const PRIORITY_HIGH_RE = /(?<![\p{L}\d])(?:gấp|khẩn(?: cấp)?|urgent|ưu tiên cao|rất quan trọng|quan trọng)(?![\p{L}\d])|!{2,}/iu;

/** Tách hạn chót, #dự án và mức ưu tiên khỏi tiêu đề. priority rỗng nếu không nhắc tới. */
function parseTaskText_(text) {
  let title = ' ' + String(text).trim() + ' ';
  let project = '', priority = '';
  const p = title.match(/\s#([\p{L}\d_\-]+)/u);
  if (p) { project = p[1]; title = title.replace(p[0], ' '); }
  let m = title.match(PRIORITY_LOW_RE);
  if (m) { priority = 'low'; title = title.replace(m[0], ' '); }
  else if ((m = title.match(PRIORITY_HIGH_RE))) { priority = 'high'; title = title.replace(m[0], ' '); }
  const d = extractDue_(title);
  return { title: capitalize_(d.text), due: d.due, project, priority };
}

/** Danh sách dự án đã dùng (gần đây nhất trước) + TASK_PROJECTS (Script Property, ngăn cách bằng dấu phẩy). */
function taskProjects_() {
  const seen = {}, out = [];
  const add = n => { n = String(n || '').trim(); const k = fold_(n); if (n && !seen[k]) { seen[k] = 1; out.push(n); } };
  tasks_(true).reverse().forEach(t => add(t.project));
  String(prop_('TASK_PROJECTS') || '').split(',').forEach(add);
  return out.slice(0, 30);
}

/** Ghi 1 việc từ các trường đã tách. f: {title, project, due, priority}. */
function createTask_(f) {
  const title = capitalize_(String(f.title || '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  if (!title) return { error: 'Thiếu nội dung việc cần làm.' };
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(f.due || '')) ? String(f.due) : '';
  const project = String(f.project || '').replace(/^#/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const priority = priorityKey_(f.priority) || 'medium';
  const id = tasks_(true).reduce((mx, t) => Math.max(mx, t.id), 0) + 1;
  sheet_(SHEETS.TASKS).appendRow([id, title, TASK_STATUS.TODO, due, project, today_(), '', priorityOf_(priority).label]);
  return { id, title, due, project, priority };
}

function taskReply_(t) {
  return `📝 #${t.id} ${t.title}` + (t.due ? ` · hạn ${dueLabel_(t.due)}` : '') + (t.project ? ` · #${t.project}` : '') +
    ` · ${priorityOf_(t.priority).icon} ${priorityOf_(t.priority).label}\nXong thì gõ /done ${t.id}`;
}

function addTask_(text, dueOverride) {
  const f = parseTaskText_(text);
  if (!f.title) return 'Cú pháp: /todo <việc cần làm> [hôm nay|mai|25/10] [#dự_án] [gấp]';
  if (dueOverride) f.due = dueOverride;
  return taskReply_(createTask_(f));
}

/** Như addTask_, nhưng nếu có Gemini thì để AI điền những gì bạn chưa nói rõ (dự án, hạn, ưu tiên). Lỗi AI thì dùng kết quả quy tắc. */
function addTaskSmart_(text, dueOverride) {
  const f = parseTaskText_(text);
  if (!f.title) return addTask_(text, dueOverride);
  if (dueOverride) f.due = dueOverride;
  if (aiEnabled_() && (!f.project || !f.due || !f.priority)) {
    try {
      const a = aiTask_({ text: String(text) });
      if (a) { f.title = a.title || f.title; f.project = f.project || a.project; f.due = f.due || a.due; f.priority = f.priority || a.priority; }
    } catch (e) { console.error(e); }
  }
  return taskReply_(createTask_(f));
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
  return `${flag} #${t.id} ${t.title}` + (t.due ? ` · ${prettyDate_(t.due)}` : '') + (t.project ? ` · #${t.project}` : '') +
    (t.priority === 'high' ? ' · ❗gấp' : '');
}

function sortTasks_(list) {
  const rank = { doing: 0, todo: 1, done: 2 }, pr = { high: 0, medium: 1, low: 2 };
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  return list.sort((a, b) => (rank[a.status] - rank[b.status]) || cmp(a.due || '9999', b.due || '9999') ||
    (pr[a.priority] - pr[b.priority]) || a.id - b.id);
}

function taskReport_() {
  const list = sortTasks_(tasks_(false));
  if (!list.length) return '🎯 Không còn việc nào đang mở. Thêm bằng: /todo Gửi báo cáo mai #work';
  return `🎯 Việc đang mở (${list.length})\n` + list.map(taskLine_).join('\n') +
    '\n\n🔴 quá hạn · 🟠 hôm nay · ⏳ đang làm';
}
