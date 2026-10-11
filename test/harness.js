// Giả lập tối thiểu Apps Script (Sheets, Properties, Utilities) để chạy code .gs trong Node.
const fs = require('fs'), vm = require('vm'), path = require('path');

function makeSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getLastRow: () => data.length,
    getMaxRows: () => 1000,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (data[r - 1 + i] = data[r - 1 + i] || [])[c - 1 + j] = x; })); return this; },
        setValue(x) { (data[r - 1] = data[r - 1] || [])[c - 1] = x; return this; },
        setFontWeight() { return this; }, setNumberFormat() { return this; },
      };
    },
    appendRow: row => { data.push(row.slice()); },
    deleteRow: i => { data.splice(i - 1, 1); },
    setFrozenRows() {},
  };
  return sh;
}

function load(files) {
  const sheets = {}, props = { SHEET_ID: 'x', WEB_KEY: 'K', ALLOWED_CHAT_ID: '1' };
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n)),
    setSpreadsheetTimeZone() {}, getId: () => 'x',
  };
  const ctx = {
    console, Promise,
    SpreadsheetApp: { openById: () => ss, create: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, getProperties: () => props }) },
    ScriptApp: {
      getOAuthToken: () => 'test-token', _triggers: [],
      newTrigger(fn) { const o = { fn, after() { return o; }, timeBased() { return o; }, everyDays() { return o; }, atHour() { return o; }, inTimezone() { return o; },
        create() { ctx.ScriptApp._triggers.push({ getHandlerFunction: () => fn, fn }); return o; } }; return o; },
      getProjectTriggers: () => ctx.ScriptApp._triggers, deleteTrigger(t) { ctx.ScriptApp._triggers = ctx.ScriptApp._triggers.filter(x => x !== t); },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { sleep(ms) { ctx.__slept = (ctx.__slept || 0) + ms; },
      base64DecodeWebSafe: s => Buffer.from(s, 'base64url'), newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
      formatDate: (d, tz, f) => {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
      return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
    }, getUuid: () => 'uuid' },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    UrlFetchApp: { fetch: (url, o) => { if (!ctx.__fetch) throw new Error('network disabled in tests'); ctx.__calls.push({ url, method: (o && o.method) || 'get', payload: o && o.payload });
      const r = ctx.__fetch(url, o || {}); return { getResponseCode: () => r.code || 200, getContentText: () => typeof r.body === 'string' ? r.body : JSON.stringify(r.body) }; } },
    __calls: [],
  };
  vm.createContext(ctx);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), ctx));
  return { run: s => vm.runInContext(s, ctx), sheets, props, ctx, setFetch: fn => { ctx.__fetch = fn; } };
}
module.exports = { load };
