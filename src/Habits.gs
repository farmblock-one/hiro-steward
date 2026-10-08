/** Thói quen: định nghĩa ở sheet Habits, mỗi lần hoàn thành là 1 dòng ở HabitLog. */

function habits_() {
  return rows_(SHEETS.HABITS)
    .filter(r => r.values[0] && r.values[2] !== false && String(r.values[2]).toLowerCase() !== 'false')
    .map(r => ({ name: String(r.values[0]), target: Number(r.values[1]) || 7, row: r.row }));
}

function addHabit_(name, target) {
  name = capitalize_(name);
  if (!name) return 'Cú pháp: /habit_add <tên> [số lần/tuần]\nVí dụ: /habit_add Tập thể dục 4';
  if (habits_().some(h => fold_(h.name) === fold_(name))) return `“${name}” đã có rồi.`;
  sheet_(SHEETS.HABITS).appendRow([name, target || 7, true, today_()]);
  return `🌱 Đã thêm thói quen “${name}” (mục tiêu ${target || 7} lần/tuần).\nKhi làm xong chỉ cần nhắn “${name.toLowerCase()}”.`;
}

/** Tìm thói quen có tên nằm trong câu (so khớp không dấu, ưu tiên tên dài nhất). */
function matchHabit_(text) {
  const t = ' ' + fold_(text) + ' ';
  let best = null;
  for (const h of habits_()) {
    const n = fold_(h.name);
    if (t.includes(' ' + n + ' ') && (!best || n.length > fold_(best.name).length)) best = h;
  }
  return best;
}

function habitLogs_() {
  return rows_(SHEETS.HABIT_LOG).map(r => ({ date: dayKey_(r.values[0]), habit: String(r.values[1]), row: r.row }));
}

function logHabit_(habitName, note, date) {
  date = date || today_();
  const done = habitLogs_().some(l => l.date === date && fold_(l.habit) === fold_(habitName));
  if (!done) sheet_(SHEETS.HABIT_LOG).appendRow([date, habitName, note || '', nowStr_()]);
  const st = habitStats_(habitName);
  return (done ? `👌 “${habitName}” đã được ghi cho ngày ${prettyDate_(date)} rồi.` : `🔥 Đã check “${habitName}”!`) +
    `\nChuỗi: ${st.streak} ngày | Tuần này: ${st.week}/${st.target}`;
}

/** Bật/tắt check một ngày (dùng cho web app). */
function toggleHabit_(habitName, date) {
  const log = habitLogs_().find(l => l.date === date && fold_(l.habit) === fold_(habitName));
  if (log) sheet_(SHEETS.HABIT_LOG).deleteRow(log.row);
  else sheet_(SHEETS.HABIT_LOG).appendRow([date, habitName, '', nowStr_()]);
  return !log;
}

function habitStats_(habitName, logs) {
  const h = habits_().find(x => fold_(x.name) === fold_(habitName)) || { target: 7 };
  const days = new Set((logs || habitLogs_()).filter(l => fold_(l.habit) === fold_(habitName)).map(l => l.date));
  const t = today_();
  // Chuỗi tính tới hôm nay; nếu hôm nay chưa làm thì tính tới hôm qua (chưa “gãy”).
  let cur = days.has(t) ? t : addDays_(t, -1), streak = 0;
  while (days.has(cur)) { streak++; cur = addDays_(cur, -1); }
  const ws = weekStart_(t);
  let week = 0;
  for (let d = ws; d <= t; d = addDays_(d, 1)) if (days.has(d)) week++;
  return { streak, week, target: h.target, doneToday: days.has(t), days };
}

function habitReport_() {
  const list = habits_();
  if (!list.length) return 'Chưa có thói quen nào. Thêm bằng: /habit_add Đọc sách 5';
  const logs = habitLogs_();
  const t = today_();
  const lines = list.map(h => {
    const st = habitStats_(h.name, logs);
    let dots = '';
    for (let i = 6; i >= 0; i--) dots += st.days.has(addDays_(t, -i)) ? '🟩' : '⬜';
    return `${st.doneToday ? '✅' : '▫️'} ${h.name}\n   ${dots}  chuỗi ${st.streak} · tuần ${st.week}/${st.target}`;
  });
  return '🌱 Thói quen (7 ngày gần nhất)\n' + lines.join('\n');
}
