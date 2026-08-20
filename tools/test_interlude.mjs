// 题词过渡页（interlude）冒烟测试：进入→题词淡入→点击→黑幕双向淡入淡出→下一章
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'file:///C:/Users/chris/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const root = process.cwd();
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<script src="story\.js"><\/script>/, '<script>window.__STORY__ = ' + JSON.stringify({
  startScene: 'interlude_bridge',
  speakers: {}, combinations: [],
  data: { clues: {}, items: {}, notes: {}, characters: {} },
  scenes: [
    { id: 'interlude_bridge', type: 'interlude', owner: 'all', bg: 'black', quote: '风穿过洞穴，没有声音。\n\n—— 间章', goto: 'chapter0201' },
    { id: 'chapter0201', owner: 'wu', bg: 'cloudy', story: '# 无声的早晨\n吴秋崖被热醒了。', initBlocks: [] }
  ]
}) + ';</script>');

const vc = new VirtualConsole();
let errs = 0;
vc.on('jsdomError', e => { if (!/canvas|getContext|Not implemented/i.test(e.message)) { console.log('[jsdomError]', e.message); errs++; } });
const dom = new JSDOM(html, { url: 'file://' + root + '/index.html', runScripts: 'dangerously', resources: 'usable', virtualConsole: vc,
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true }); w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {}; } });

const { window } = dom; const d = window.document;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function assert(c, m) { if (!c) throw new Error(m); }
function step(m, fn) { try { fn(); console.log('✓ ' + m); } catch (e) { console.log('✗ ' + m + ' — ' + e.message); process.exitCode = 1; } }

await sleep(1600); // 等进入过渡（黑幕 1200 + 余量）后题词显示
const stage = d.getElementById('interlude-stage');
const reveal = d.getElementById('interlude-reveal');
const coverFade = d.getElementById('cover-fade');
const app = d.getElementById('app');
step('进入 interlude：题词页显示且题词文字正确', () => {
  assert(stage.style.display === 'flex', '题词页应显示（display:flex）');
  assert(reveal.classList.contains('show'), '题词应淡入（.show）');
  assert((reveal.querySelector('.quote').textContent || '').indexOf('间章') >= 0, '题词文字应包含测试内容');
});
// 题词尚未停留完毕时点击：不应触发离开（避免误触跳过）
stage.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(200);
step('题词未停留完毕时点击：不触发离开（防误触跳过）', () => {
  assert(!coverFade.classList.contains('on'), '黑幕不应开始淡入（未跳转）');
  assert(reveal.classList.contains('show'), '题词仍应显示');
});
// 等待题词完全显示 + 停留后，右下角出现「点击继续」提示
await sleep(3200); // 累计约 4800ms = 进入1200 + 淡入2400 + 停留1200
step('停留后：右下角出现「点击继续」提示', () => {
  const hint = d.querySelector('#interlude-stage .interlude-hint');
  assert(hint && hint.classList.contains('show'), '应显示继续提示');
});
// 点击题词页 → 离开过渡
stage.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(200);
step('点击题词页：题词淡出 + 黑幕淡入开始', () => {
  assert(coverFade.classList.contains('on'), '黑幕应开始淡入（.on）');
  assert(!reveal.classList.contains('show'), '题词应开始淡出（移除 show）');
});
await sleep(400); // 黑幕淡入中途（尚未交换）
step('黑幕淡入中途：黑幕仍盖住、题词页未隐藏（不露上一页）', () => {
  assert(coverFade.classList.contains('on'), '黑幕应仍在盖住（未提前消失导致闪帧）');
  assert(stage.style.display === 'flex', '题词页仍在前台，未露出游戏背景');
});
await sleep(900); // 累计离开约 1500ms ≈ 离开 1200 + 交换余量
step('黑幕遮住后：交换为正文、题词页隐藏', () => {
  assert(app.style.display !== 'none', '正文应已就位显示');
  assert(stage.style.display === 'none', '题词页应隐藏');
  assert(!coverFade.classList.contains('on'), '黑幕应开始淡出（移除 on）');
});
await sleep(1700); // 黑幕淡出收尾
step('淡入结束：黑幕隐藏、正文加载（无声的早晨）', () => {
  assert(coverFade.style.display === 'none', '黑幕应隐藏');
  const txt = (d.getElementById('storyArea') && d.getElementById('storyArea').textContent) || '';
  assert(txt.indexOf('无声的早晨') >= 0, '正文应已加载（含“无声的早晨”）');
});

console.log(errs ? '✗ 有 JS 错误' : (process.exitCode ? '✗ 存在失败用例' : '✓ 题词过渡页全部通过'));
process.exit(process.exitCode || errs ? 1 : 0);
