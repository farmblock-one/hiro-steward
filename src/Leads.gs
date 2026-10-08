/**
 * Lead tracking cho Account Manager.
 * Mỗi lead có: giai đoạn, giá trị, next action + hạn, lần liên hệ cuối. Lịch sử liên hệ ở sheet LeadLog.
 * Bot nhắc mỗi sáng: lead quá hạn / đến hạn hôm nay / chưa có next action / lâu chưa liên hệ.
 */

const LC = { ID: 0, NAME: 1, CONTACT: 2, STAGE: 3, VALUE: 4, NEXT: 5, DUE: 6, SOURCE: 7, NOTE: 8,
  CREATED: 9, LAST: 10, UPDATED: 11, LOST: 12 };

// ---------- Giai đoạn ----------

function stageByKey_(key) { return LEAD_STAGES.find(s => s.key === key) || LEAD_STAGES[0]; }

/** Nhận key, nhãn hoặc cách gõ tắt (“bao gia”, “demo”…). Trả về key hoặc ''. */
function stageKey_(text) {
  const f = fold_(text);
  if (!f) return '';
  const hit = LEAD_STAGES.find(s => s.key === f || fold_(s.label) === f || s.alias.indexOf(f) >= 0);
  return hit ? hit.key : '';
}

// ---------- Đọc dữ liệu ----------

function leadFromRow_(r) {
  const v = r.values, t = today_();
  const stage = stageKey_(v[LC.STAGE]) || 'new';
  const last = dayKey_(v[LC.LAST]) || dayKey_(v[LC.CREATED]);
  const lead = {
    id: Number(v[LC.ID]), name: String(v[LC.NAME]), contact: String(v[LC.CONTACT] || ''),
    stage, stageLabel: stageByKey_(stage).label, value: Number(v[LC.VALUE]) || 0,
    next: String(v[LC.NEXT] || ''), due: dayKey_(v[LC.DUE]), source: String(v[LC.SOURCE] || ''),
    note: String(v[LC.NOTE] || ''), created: dayKey_(v[LC.CREATED]), lastContact: last,
    lostReason: String(v[LC.LOST] || ''), row: r.row,
  };
  lead.closed = LEAD_CLOSED.indexOf(stage) >= 0;
  lead.daysSince = last ? Math.round((new Date(t + 'T12:00:00Z') - new Date(last + 'T12:00:00Z')) / 86400000) : 0;
  lead.state = lead.closed ? 'closed' : !lead.next && !lead.due ? 'none'
    : !lead.due ? 'none' : lead.due < t ? 'overdue' : lead.due === t ? 'today' : 'upcoming';
  lead.stale = !lead.closed && lead.daysSince >= STALE_DAYS;
  return lead;
}

function leads_(includeClosed) {
  return rows_(SHEETS.LEADS).filter(r => r.values[LC.ID] && r.values[LC.NAME])
    .map(leadFromRow_).filter(l => includeClosed || !l.closed);
}

/** Tìm theo ID hoặc một phần tên. Trả về {lead} hoặc {error}. */
function resolveLead_(ref) {
  ref = String(ref || '').trim().replace(/^#/, '');
  if (!ref) return { error: 'Cho mình biết lead nào nhé: ID (vd. 3) hoặc một phần tên.' };
  const all = leads_(true);
  if (/^\d+$/.test(ref)) {
    const l = all.find(x => x.id === Number(ref));
    return l ? { lead: l } : { error: `Không thấy lead #${ref}. Xem /leads` };
  }
  const f = fold_(ref);
  const hits = all.filter(l => fold_(l.name).indexOf(f) >= 0);
  const open = hits.filter(l => !l.closed);
  const pick = open.length ? open : hits;
  if (pick.length === 1) return { lead: pick[0] };
  if (!pick.length) return { error: `Không thấy lead nào tên “${ref}”. Xem /leads` };
  return { error: 'Có nhiều lead khớp, dùng ID nhé:\n' + pick.slice(0, 8).map(l => `#${l.id} ${l.name}`).join('\n') };
}

/**
 * Tách “3 gọi lại thứ 6” hoặc “beta gọi lại thứ 6” thành lead + phần còn lại.
 * Với tên: lấy số từ ít nhất đủ để chỉ khớp đúng 1 lead (“beta” khớp Beta Ltd thì phần còn lại là việc tiếp theo).
 * Có dấu “|” hoặc “:” thì phần trước là tên.
 */
function splitLeadRef_(arg) {
  arg = String(arg || '').trim();
  const m = arg.match(/^#?(\d+)(?:\s+([\s\S]*))?$/);
  if (m) return { ref: m[1], rest: (m[2] || '').trim() };
  const piped = arg.match(/^([^|:]+?)\s*[|:]\s*([\s\S]*)$/);
  if (piped) return { ref: piped[1].trim(), rest: piped[2].trim() };
  const words = arg.split(/\s+/), all = leads_(true);
  for (let k = 1; k <= Math.min(words.length, 6); k++) {
    const f = fold_(words.slice(0, k).join(' '));
    const hits = all.filter(l => fold_(l.name).indexOf(f) >= 0);
    if (hits.length === 1) return { ref: words.slice(0, k).join(' '), rest: words.slice(k).join(' ') };
    if (!hits.length) break;
  }
  return { ref: arg, rest: '' };
}

// ---------- Ghi dữ liệu ----------

function nextLeadId_() {
  return leads_(true).reduce((mx, l) => Math.max(mx, l.id), 0) + 1;
}

function setLeadCells_(lead, cells) {
  const sh = sheet_(SHEETS.LEADS);
  Object.keys(cells).forEach(k => sh.getRange(lead.row, Number(k) + 1).setValue(cells[k]));
  sh.getRange(lead.row, LC.UPDATED + 1).setValue(nowStr_());
}

function parseValue_(v) {
  if (typeof v === 'number') return v;
  v = String(v || '').trim();
  if (!v) return 0;
  const a = parseAmount_(v);
  return a ? a.amount : 0;
}

/** “ABC Corp | 50tr | gửi báo giá thứ 6 | @chị Mai” -> các trường lead. */
function parseLeadText_(text) {
  const parts = String(text || '').split(/\s*(?:\||;|\s-\s)\s*/).map(s => s.trim()).filter(Boolean);
  const lead = { name: '', contact: '', value: 0, next: '', due: '', stage: '', source: '', note: '' };
  parts.forEach((seg, i) => {
    if (i === 0) {
      const am = parseAmount_(seg);
      if (am && am.hasUnit && am.rest) { lead.value = am.amount; seg = am.rest; }
      lead.name = capitalize_(seg);
      return;
    }
    const st = stageKey_(seg);
    if (st) { lead.stage = st; return; }
    const am = parseAmount_(seg);
    if (am && am.hasUnit && !am.rest) { lead.value = am.amount; return; }
    let m;
    if ((m = seg.match(/^@\s*(.+)$/)) || (m = seg.match(/^(?:liên hệ|lh|contact)\s*[:\-]?\s*(.+)$/i))) { lead.contact = m[1].trim(); return; }
    if ((m = seg.match(/^(?:nguồn|source)\s*[:\-]?\s*(.+)$/i))) { lead.source = m[1].trim(); return; }
    if ((m = seg.match(/^(?:ghi chú|note)\s*[:\-]?\s*(.+)$/i))) { lead.note = m[1].trim(); return; }
    const d = extractDue_(seg);
    if (d.due) { lead.due = d.due; if (d.text && !lead.next) lead.next = capitalize_(d.text); return; }
    if (!lead.next) lead.next = capitalize_(seg); else lead.note = (lead.note ? lead.note + '; ' : '') + seg;
  });
  return lead;
}

/** Thêm lead mới từ object (web app / AI) hoặc đã parse. */
function createLead_(f) {
  const name = String(f.name || '').trim();
  if (!name) return { error: 'Thiếu tên lead.' };
  const dup = leads_(false).find(l => fold_(l.name) === fold_(name));
  if (dup) return { error: `Lead “${dup.name}” đã có (#${dup.id}). Dùng /next ${dup.id} <việc tiếp theo> để cập nhật.` };
  const id = nextLeadId_();
  const stage = stageByKey_(f.stage || 'new');
  sheet_(SHEETS.LEADS).appendRow([id, capitalize_(name), f.contact || '', stage.label, parseValue_(f.value),
    f.next || '', f.due || '', f.source || '', f.note || '', today_(), today_(), nowStr_(), '']);
  return { id };
}

function leadSummaryLine_(l) {
  return `#${l.id} ${l.name}` + (l.value ? ` · ${money_(l.value)}` : '') + ` · ${l.stageLabel}`;
}

function addLead_(text) {
  const f = parseLeadText_(text);
  if (!f.name) return 'Cú pháp: /lead Tên | giá trị | việc tiếp theo | hạn | @người liên hệ\n' +
    'Ví dụ: /lead ABC Corp | 50tr | gửi báo giá | thứ 6 | @chị Mai';
  const r = createLead_(f);
  return r.error ? r.error : addLeadReply_(r.id);
}

function addLeadReply_(id) {
  const l = leads_(true).find(x => x.id === id);
  return `🐟 Đã thêm lead ${leadSummaryLine_(l)}` +
    (l.next ? `\n➜ ${l.next}` + (l.due ? ` · ${dueLabel_(l.due)}` : '') : '') +
    (!l.next || !l.due ? `\n⚪ Chưa đủ next action + hạn. Đặt bằng: /next ${l.id} gọi lại thứ 6` : '');
}

/** Đặt next action. Thiếu hạn thì mặc định ngày mai (lead không có hạn thì không nhắc được). */
function setNextAction_(ref, text) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const d = extractDue_(text);
  if (!d.text && !d.due) return `Cú pháp: /next ${r.lead.id} <việc tiếp theo> [hạn]\nVí dụ: /next ${r.lead.id} gửi báo giá thứ 6`;
  const defaulted = !d.due;
  const due = d.due || addDays_(today_(), 1);
  const next = d.text ? capitalize_(d.text) : r.lead.next;
  setLeadCells_(r.lead, { [LC.NEXT]: next, [LC.DUE]: due });
  return `➜ #${r.lead.id} ${r.lead.name}: ${next} · ${dueLabel_(due)} (${prettyDate_(due)})` +
    (defaulted ? '\n(Không thấy hạn nên đặt ngày mai. Đổi: /next ' + r.lead.id + ' ' + next + ' 25/10)' : '');
}

function appendLeadLog_(lead, note) {
  sheet_(SHEETS.LEAD_LOG).appendRow([today_(), lead.id, lead.name, note, nowStr_()]);
}

/** Ghi 1 lần liên hệ; có thể kèm next action sau dấu “|”. */
function logLeadContact_(ref, text, nextText) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const l = r.lead;
  let note = String(text || '').trim(), next = nextText;
  if (next == null && note.indexOf('|') >= 0) { const p = note.split('|'); note = p[0].trim(); next = p.slice(1).join('|').trim(); }
  if (!note && !next) return `Cú pháp: /log ${l.id} <đã trao đổi gì> | <việc tiếp theo> [hạn]`;
  if (note) appendLeadLog_(l, note);
  setLeadCells_(l, { [LC.LAST]: today_() });
  let out = `📞 Đã ghi liên hệ với ${l.name}` + (note ? `: ${note}` : '');
  if (next) out += '\n' + setNextAction_(l.id, next);
  else if (!l.closed) out += `\nĐừng quên đặt next action: /next ${l.id} gửi báo giá thứ 6`;
  return out;
}

function setLeadStage_(ref, stageText, reason) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const key = stageKey_(stageText);
  if (!key) return 'Giai đoạn: ' + LEAD_STAGES.map(s => s.label).join(' → ');
  const st = stageByKey_(key), cells = { [LC.STAGE]: st.label };
  if (key === 'lost') cells[LC.LOST] = reason || '';
  if (LEAD_CLOSED.indexOf(key) >= 0) { cells[LC.NEXT] = ''; cells[LC.DUE] = ''; }
  setLeadCells_(r.lead, cells);
  const l = r.lead;
  if (key === 'won') return `🎉🐱 Chốt được ${l.name}${l.value ? ' · ' + money_(l.value) : ''}! Giỏi quá meo!`;
  if (key === 'lost') return `😿 Đã đóng ${l.name} (thua)${reason ? ': ' + reason : ''}`;
  return `🐟 #${l.id} ${l.name} → ${st.label}`;
}

function snoozeLead_(ref, days) {
  const r = resolveLead_(ref); if (r.error) return r.error;
  const n = Number(days) || 1, t = today_();
  const base = r.lead.due && r.lead.due > t ? r.lead.due : t;
  const due = addDays_(base, n);
  setLeadCells_(r.lead, { [LC.DUE]: due, [LC.NEXT]: r.lead.next || 'Follow-up' });
  return `⏰ Dời #${r.lead.id} ${r.lead.name} sang ${dueLabel_(due)} (${prettyDate_(due)})`;
}

function leadHistory_(id) {
  return rows_(SHEETS.LEAD_LOG).filter(r => Number(r.values[1]) === Number(id))
    .map(r => ({ date: dayKey_(r.values[0]), note: String(r.values[3]) })).reverse().slice(0, 5);
}

// ---------- Báo cáo & nhắc nhở ----------

function sortLeads_(list) {
  const rank = { overdue: 0, today: 1, upcoming: 2, none: 3, closed: 4 };
  return list.sort((a, b) => (rank[a.state] - rank[b.state]) || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0) || b.value - a.value);
}

function leadFlag_(l) {
  return l.state === 'overdue' ? '🔴' : l.state === 'today' ? '🟠' : l.state === 'none' ? '⚪' : l.stale ? '🟡' : '🟢';
}

function leadLine_(l) {
  let s = `${leadFlag_(l)} #${l.id} ${l.name}` + (l.value ? ` · ${money_(l.value)}` : '') + ` · ${l.stageLabel}`;
  s += l.next ? `\n    ➜ ${l.next}${l.due ? ' · ' + dueLabel_(l.due) : ''}` : '\n    ➜ chưa có next action';
  if (l.stale) s += `\n    🟡 ${l.daysSince} ngày chưa liên hệ`;
  return s;
}

function leadReport_(filter) {
  let list = leads_(false);
  const f = String(filter || '').trim();
  if (f) { const ff = fold_(f); list = list.filter(l => fold_(l.name).indexOf(ff) >= 0 || fold_(l.stageLabel).indexOf(ff) >= 0); }
  if (!list.length) return f ? `Không có lead nào khớp “${f}”.` : '🐟 Chưa có lead nào. Thêm: /lead ABC Corp | 50tr | gửi báo giá | thứ 6';
  list = sortLeads_(list);
  const total = list.reduce((s, l) => s + l.value, 0);
  return `🐟 Lead đang mở (${list.length}) · ${money_(total)}\n\n` + list.map(leadLine_).join('\n') +
    '\n\n🔴 quá hạn · 🟠 hôm nay · ⚪ thiếu next action · 🟡 nguội · 🟢 ổn';
}

function pipelineReport_() {
  const all = leads_(true), open = all.filter(l => !l.closed);
  if (!all.length) return 'Chưa có lead nào. Thêm: /lead ABC Corp | 50tr | gửi báo giá | thứ 6';
  const lines = LEAD_STAGES.filter(s => LEAD_CLOSED.indexOf(s.key) < 0).map(s => {
    const x = open.filter(l => l.stage === s.key);
    return `${s.label}: ${x.length} lead` + (x.length ? ` · ${money_(x.reduce((a, l) => a + l.value, 0))}` : '');
  });
  const m = monthStart_(today_());
  const wonM = all.filter(l => l.stage === 'won' && dayKey_(l.lastContact) >= m);
  return `📊 Phễu bán hàng\n${lines.join('\n')}\n\nĐang mở: ${open.length} · ${money_(open.reduce((a, l) => a + l.value, 0))}` +
    `\n🎉 Đã chốt tháng này: ${wonM.length} · ${money_(wonM.reduce((a, l) => a + l.value, 0))}` +
    `\n🟡 Lead nguội (≥${STALE_DAYS} ngày): ${open.filter(l => l.stale).length}`;
}

/** Gom các lead cần chú ý để nhắc. */
function leadAttention_() {
  const open = leads_(false);
  const hot = l => l.state === 'overdue' || l.state === 'today';
  return {
    overdue: sortLeads_(open.filter(l => l.state === 'overdue')),
    today: sortLeads_(open.filter(l => l.state === 'today')),
    none: open.filter(l => l.state === 'none'),
    stale: open.filter(l => l.stale && !hot(l) && l.state !== 'none'),
  };
}

function leadAttentionText_() {
  const a = leadAttention_(), out = [];
  const short = l => `• #${l.id} ${l.name}${l.value ? ' (' + money_(l.value) + ')' : ''}: ${l.next || '—'}` + (l.state === 'overdue' ? ` · ${dueLabel_(l.due)}` : '');
  if (a.overdue.length) out.push(`🔴 Lead quá hạn (${a.overdue.length})\n` + a.overdue.map(short).join('\n'));
  if (a.today.length) out.push(`🟠 Cần làm hôm nay (${a.today.length})\n` + a.today.map(short).join('\n'));
  if (a.none.length) out.push(`⚪ Chưa có next action (${a.none.length}): ` + a.none.map(l => `#${l.id} ${l.name}`).join(', '));
  if (a.stale.length) out.push(`🟡 Lâu chưa liên hệ (${a.stale.length}): ` + a.stale.map(l => `#${l.id} ${l.name} (${l.daysSince}n)`).join(', '));
  return out.join('\n\n');
}
