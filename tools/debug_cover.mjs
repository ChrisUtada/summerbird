// 封面→正文 过渡冒烟测试：验证题词→正文为淡出(至黑幕)→交换→淡入(黑幕消散)的双段淡入淡出，无硬切闪屏
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'file:///C:/Users/chris/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const root = process.cwd();
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/<script src="story\.js"><\/script>/, '<script>window.__STORY__ = ' + JSON.stringify({
  startScene: 'cv', data: { clues: {}, items: { '纸片': { name: '纸片', desc: '' } }, notes: {}, characters: {} },
  speakers: {}, combinations: [],
  scenes: [{ id: 'cv', owner: 'shan', bg: 'cloudy', story: '# 序\n商难接过了{填:纸片}。', initBlocks: [] }]
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

await sleep(500);
const coverWrapper = d.getElementById('cover-wrapper');
const coverStage = d.getElementById('cover-stage');
const coverFade = d.getElementById('cover-fade');
const app = d.getElementById('app');
const btnMusic = d.getElementById('btnMusic');

step('初始：封面显示、正文隐藏、音乐按钮存在', () => {
  assert(coverStage.style.display !== 'none', '封面应显示');
  assert(app.style.display === 'none', '正文应隐藏');
  assert(btnMusic, '音乐按钮 btnMusic 应存在');
});

// 点击封面 → beginSink
coverWrapper.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(2000); // 等 SINK_MS(1800) 后进入 revealed
step('封面下沉后进入引文态（revealed）', () => {
  assert(d.getElementById('cover-reveal').classList.contains('show'), '引文应显示');
});

// 点击任意处 → goto：题词先淡出至黑幕（阶段一：淡出）
d.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(200);
step('进入开始：题词淡出至黑幕（.on 生效，正文仍在黑幕之下未显）', () => {
  assert(coverFade.classList.contains('on'), '黑幕应已淡入（.on 生效），覆盖题词');
  assert(!d.getElementById('cover-reveal').classList.contains('show'), '题词应开始淡出（移除 show）');
  assert(coverStage.style.display !== 'none', '阶段一封面/题词仍可见，尚未硬切');
  assert(app.style.display === 'none', '正文应仍在黑幕之下，暂未显示');
});
await sleep(1100); // 等淡出完成并交换内容
step('黑幕完全遮住后：交换为正文、封面隐藏、黑幕开始淡出（阶段二：淡入）', () => {
  assert(app.style.display !== 'none', '正文应已就位显示');
  assert(coverStage.style.display === 'none', '封面应已隐藏');
  assert(!coverFade.classList.contains('on'), '黑幕应已移除 on，开始淡出显露正文');
});
await sleep(1700); // 等淡入结束（含黑幕 display:none 的 PHASE+300 收尾）
step('淡入结束后：黑幕隐藏、音乐按钮仍常驻右下角', () => {
  assert(coverFade.style.display === 'none', '黑幕应已隐藏');
  assert(btnMusic.style.display !== 'none', '音乐按钮应常驻（不在进入游戏后隐藏）');
});
// 进入后还需点击推进剧情，填空槽才会出现（打字机逐行显示）
for (let i = 0; i < 14; i++) {
  if (d.querySelector('#storyArea .slot')) break;
  d.getElementById('storyArea').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(130);
}
step('正文场景已加载（含填空槽）', () => {
  assert(!!d.querySelector('#storyArea .slot'), '正文场景已加载（含填空槽）');
  assert(d.querySelector('#storyArea .slot').dataset.pickup === 'item', '填空槽应为物品拾取型');
});

console.log(errs ? '✗ 有 JS 错误' : (process.exitCode ? '✗ 存在失败用例' : '✓ 封面过渡全部通过'));
process.exit(process.exitCode || errs ? 1 : 0);
