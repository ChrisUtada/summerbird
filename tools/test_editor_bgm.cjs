const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = 'E:/YID/webgames/summerbird';
let html = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
const compilerJs = fs.readFileSync(path.join(root, 'compiler.js'), 'utf8');
// 把外部 compiler.js 内联，避免 jsdom 去抓本地文件
html = html.replace('<script src="compiler.js"></script>', '<script>' + compilerJs + '</script>');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/editor.html'
});
const { window } = dom;

// 等内联脚本跑完
setTimeout(() => {
  const doc = window.document;
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else { console.log('PASS: ' + msg); } };

  const sel = doc.getElementById('sceneBgm');
  assert(!!sel, '场景音乐下拉存在');
  // 初始：default + off = 2 项（defaultED 只含 default）
  assert(sel.options.length === 2, '初始下拉含 默认+完全无音乐 两项 (got ' + sel.options.length + ')');

  // 模拟扫描 bgm 文件夹：构造文件对象数组
  const input = doc.getElementById('bgmFolderInput');
  const fakeFiles = [
    { name: 'campfire.mp3', webkitRelativePath: 'bgm/campfire.mp3' },
    { name: 'rain.ogg', webkitRelativePath: 'project/bgm/rain.ogg' }, // 选中父目录，应归一化
    { name: 'note.txt', webkitRelativePath: 'bgm/note.txt' } // 非音乐，应被忽略
  ];
  Object.defineProperty(input, 'files', { value: fakeFiles, configurable: true });
  input.dispatchEvent(new window.Event('change'));

  // 下拉应出现 campfire 与 rain
  const vals = Array.from(sel.options).map(o => o.value);
  assert(vals.includes('campfire'), '扫描后下拉出现 campfire');
  assert(vals.includes('rain'), '扫描后下拉出现 rain（父目录路径已归一化）');
  assert(!vals.includes('note'), '非音乐文件 note.txt 被忽略');

  // 模型应持有 bgmTracks
  const ed = window.SBEditor.getED();
  assert(ed.bgmTracks && ed.bgmTracks.campfire === 'bgm/campfire.mp3', 'ED.bgmTracks 登记 campfire');
  assert(ed.bgmTracks && ed.bgmTracks.rain === 'bgm/rain.ogg', 'ED.bgmTracks 登记 rain（归一化为 bgm/ 前缀）');
  assert(ed.bgmTracks.default && ed.bgmTracks.default.indexOf('samuelfjohanns') >= 0, 'default 曲目保留');

  // 导出应包含 bgmTracks
  const exported = window.SBEditor.exportStory();
  assert(exported.bgmTracks && exported.bgmTracks.campfire === 'bgm/campfire.mp3', '导出 story.js 包含 bgmTracks.campfire');
  assert(exported.bgmTracks.default, '导出包含 bgmTracks.default');

  console.log('\nDONE');
}, 300);
