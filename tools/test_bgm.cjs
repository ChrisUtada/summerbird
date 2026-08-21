// 背景音乐按章控制冒烟测试：验证曲库映射接线、默认曲起播、手动静音切换。
// 运行：node tools/test_bgm.cjs
const { JSDOM, VirtualConsole } = require('jsdom');
const { readFileSync } = require('fs');

const STORY = readFileSync('story.js', 'utf8');
let html = readFileSync('index.html', 'utf8');
// jsdom 默认不拉取外部 <script src>，需内联，否则 window.__STORY__ / SBCompiler 缺失
try { html = html.replace('<script src="compiler.js"></script>', '<script>\n' + readFileSync('compiler.js', 'utf8') + '\n</script>'); } catch (e) {}
try { html = html.replace('<script src="story.js"></script>', '<script>\n' + STORY + '\n</script>'); } catch (e) {}

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail ? (e.detail.stack || e.detail) : e.message)));

let pass = 0, fail = 0;
function step(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '  -> ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'http://localhost/',
  beforeParse(window) {
    // 提供 canvas 2d 上下文桩（游戏粒子引擎需要）
    try {
      window.HTMLCanvasElement.prototype.getContext = () => ({
        fillRect(){}, clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, save(){}, restore(){},
        translate(){}, scale(){}, createLinearGradient(){ return { addColorStop(){} }; }, getImageData(){ return { data: [] }; },
        putImageData(){}, drawImage(){}, setTransform(){}, moveTo(){}, lineTo(){}, closePath(){}, fillStyle:'', strokeStyle:'', globalAlpha:1
      });
    } catch (e) {}
    // jsdom 未实现媒体播放，桩掉 play/pause 以便测试走通（真实浏览器原生支持）
    try {
      window.HTMLMediaElement.prototype.play = function () { this.paused = false; return Promise.resolve(); };
      window.HTMLMediaElement.prototype.pause = function () { this.paused = true; };
    } catch (e) {}
  }
});
const { window } = dom;
const { document } = window;
window.addEventListener('error', ev => errors.push('window.error: ' + (ev.error ? ev.error.stack : ev.message)));

setTimeout(() => {
  const bgm = document.getElementById('bgm');
  const btn = document.getElementById('btnMusic');

  step('初始化无脚本错误', () => { assert(errors.length === 0, '错误：\n' + errors.join('\n')); });

  step('曲库映射 bgmTracks.default 存在且指向 bgm/ 文件', () => {
    const tracks = window.__STORY__ && window.__STORY__.bgmTracks;
    assert(tracks && tracks.default, 'bgmTracks.default 缺失');
    assert(tracks.default.indexOf('bgm/') === 0, 'default 路径应以 bgm/ 开头，实际=' + tracks.default);
  });

  step('audio src 已接线到默认曲', () => {
    assert((bgm.getAttribute('src') || '').indexOf('bgm/') === 0, 'audio src 未指向 bgm/，实际=' + bgm.getAttribute('src'));
  });

  step('点击封面（pointerdown）触发默认曲起播，按钮进入 playing', () => {
    const cover = document.getElementById('cover-wrapper');
    cover.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  });

  setTimeout(() => {
    step('起播后按钮显示 playing（♫）', () => {
      assert(btn.classList.contains('playing'), '按钮应带 playing 类（默认曲应已起播）');
    });

    step('点击 #btnMusic 手动静音：暂停且按钮去掉 playing', () => {
      btn.click();
      assert(bgm.paused, '手动静音后 bgm 应 paused');
      assert(!btn.classList.contains('playing'), '静音后按钮不应带 playing');
    });

    step('再次点击 #btnMusic 恢复播放（userMuted 解除）', () => {
      btn.click();
      // play() 为异步；等待一帧让回调置 playing
    });

    setTimeout(() => {
      step('恢复后按钮回到 playing', () => {
        assert(btn.classList.contains('playing'), '恢复后按钮应带 playing');
      });

      console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
      process.exit(fail ? 1 : 0);
    }, 300);
  }, 400);
}, 800);
