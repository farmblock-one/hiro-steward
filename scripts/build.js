#!/usr/bin/env node
// Sinh các file phái sinh từ nguồn duy nhất:
//   docs/index.html  ->  src/Index.html   (bản chạy trong Apps Script, gọi google.script.run)
//   src/*.gs         ->  dist/Code.gs     (1 file duy nhất để dán vào Apps Script)
// Chạy:  node scripts/build.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };

function between(s, start, end) {
  const a = s.indexOf(start), b = s.indexOf(end);
  if (a < 0 || b < a) throw new Error(`Thiếu marker ${start} ... ${end} trong docs/index.html`);
  return [a, b + end.length];
}
function replaceBlock(s, start, end, replacement) {
  const [a, b] = between(s, start, end);
  return s.slice(0, a) + replacement + s.slice(b);
}

let html = read('docs/index.html');
html = replaceBlock(html, '<!--@pwa-->', '<!--@end-pwa-->', '');
html = replaceBlock(html, '/*@config*/', '/*@end-config*/',
  "let API = 'apps-script', KEY = <?!= JSON.stringify(webKey) ?>;");
html = replaceBlock(html, '/*@transport*/', '/*@end-transport*/',
  `function call(fn, ...args) {
    return new Promise((resolve, reject) => google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(e => reject(new Error(e && e.message || e)))[fn](KEY, ...args));
  }`);
// Trong template của Apps Script, mọi “<?” đều bị hiểu là scriptlet. Chỉ được có đúng 1 chỗ.
const n = (html.match(/<\?/g) || []).length;
if (n !== 1) throw new Error(`Index.html chứa ${n} chuỗi "<?" (chỉ cho phép 1 scriptlet)`);
write('src/Index.html', '<!-- FILE SINH TỰ ĐỘNG từ docs/index.html bằng `node scripts/build.js`. Đừng sửa tay. -->\n' + html);

const order = ['Config', 'Utils', 'Finance', 'Habits', 'Tasks', 'Leads', 'AI', 'Telegram', 'Router', 'WebApi', 'Code'];
const present = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.gs')).map(f => f.replace('.gs', ''));
const missing = present.filter(f => !order.includes(f));
if (missing.length) throw new Error('Thêm vào danh sách order trong scripts/build.js: ' + missing.join(', '));
write('dist/Code.gs', order.map(f => `// ===================== ${f}.gs =====================\n\n${read(`src/${f}.gs`)}\n`).join('\n'));
console.log(`Built src/Index.html and dist/Code.gs (${order.length} files)`);
