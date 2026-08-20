// 背景天气切换淡入淡出冒烟测试（CJS，jsdom）
const { JSDOM, VirtualConsole } = require('jsdom');
const { readFileSync } = require('fs');
let html = readFileSync('index.html', 'utf8');
try { html = html.replace('<script src="compiler.js"></script>', '<script>\n' + readFileSync('compiler.js', 'utf8') + '\n</script>'); } catch (e) {}
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail ? (e.detail.stack || e.detail) : e.message)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      fillRect(){}, clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, save(){}, restore(){},
      translate(){}, scale(){}, createLinearGradient(){ return { addColorStop(){} }; }, getImageData(){ return { data: [] }; },
      putImageData(){}, drawImage(){}, setTransform(){}, moveTo(){}, lineTo(){}, closePath(){},
      fillStyle:'', strokeStyle:'', globalAlpha:1
    });
  }
});
const { window } = dom;
const { document } = window;
window.addEventListener('error', ev => errors.push('window.error: ' + (ev.error ? ev.error.stack : ev.message)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  \u2713 ' + m); } else { fail++; console.log('  \u2717 ' + m); } }
(async () => {
  await sleep(500);
  console.log('== test_bg_fade ==');
  assert(typeof window.setSceneBg === 'function', 'setSceneBg 已定义');
  assert(document.body.className.indexOf('bg-cloudy') >= 0, '初始背景为 cloudy');

  // 切到 ember：应触发淡出，稍后切换 className 再淡入
  window.setSceneBg('ember');
  await sleep(50);
  assert(document.querySelector('.bg-layer').classList.contains('bg-fading'), '切换瞬间：背景层加上 bg-fading（开始淡出）');
  assert(document.body.className.indexOf('bg-cloudy') >= 0 && document.body.className.indexOf('bg-ember') < 0, '切换瞬间：body.className 尚未改变（避免硬切）');

  await sleep(700);
  assert(document.body.className.indexOf('bg-ember') >= 0, '淡出完成后：body.className 已切到 ember');
  assert(!document.querySelector('.bg-layer').classList.contains('bg-fading'), '淡入后：bg-fading 已移除');

  // 相同 bg：不应触发淡出
  window.setSceneBg('ember');
  await sleep(50);
  assert(!document.querySelector('.bg-layer').classList.contains('bg-fading'), '相同 bg：不触发淡出');

  // 再切回 cloudy：应再次淡出→淡入
  window.setSceneBg('cloudy');
  await sleep(50);
  assert(document.querySelector('.bg-layer').classList.contains('bg-fading'), '再次切换：背景层重新淡出');
  await sleep(700);
  assert(document.body.className.indexOf('bg-cloudy') >= 0, '淡入完成：body.className 回到 cloudy');

  console.log('--- 初始化/运行错误 ---');
  console.log(errors.length ? errors.join('\n') : '(无)');
  console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
