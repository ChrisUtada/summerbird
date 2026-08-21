const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = 'E:/YID/webgames/summerbird';
let html = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
const compilerJs = fs.readFileSync(path.join(root, 'compiler.js'), 'utf8');
html = html.replace('<script src="compiler.js"></script>', '<script>' + compilerJs + '</script>');

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/editor.html' });
const { window } = dom;

setTimeout(() => {
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else { console.log('PASS: ' + msg); } };
  const parse = window.SBEditor.parseStoryText;

  // 1) 当前磁盘上的 story.js：含 // 注释 + window.__STORY__ = 赋值
  const onDisk = fs.readFileSync(path.join(root, 'story.js'), 'utf8');
  let r1;
  try { r1 = parse(onDisk); } catch (e) { r1 = null; console.error('  parse threw:', e.message); }
  assert(r1 && r1.bgmTracks && r1.bgmTracks.default, '含 // 注释的 story.js 可被解析，且保留 bgmTracks');

  // 2) 纯 JSON（编辑器导出的干净产物）
  const clean = 'window.__STORY__ = ' + JSON.stringify({ startScene: 'a', data: { clues: {} }, combinations: {}, scenes: [{ id: 'a' }] }) + ';';
  let r2 = parse(clean);
  assert(r2 && r2.scenes && r2.scenes.length === 1, '纯 JSON 导出文件可被解析');

  // 3) 无 window.__STORY__ 前缀的裸 JSON 也能解析
  const bare = JSON.stringify({ startScene: 'b', data: { clues: {} }, combinations: {}, scenes: [{ id: 'b' }] });
  let r3 = parse(bare);
  assert(r3 && r3.scenes && r3.scenes[0].id === 'b', '裸 JSON（无赋值前缀）也能解析');

  // 4) 真正无效的文件应抛错（而非返回 undefined 导致后续崩溃）
  let threw = false;
  try { parse('just some random text <<<'); } catch (e) { threw = true; }
  assert(threw, '完全无效的文件会抛错而非静默通过');

  console.log('\nDONE');
}, 300);
