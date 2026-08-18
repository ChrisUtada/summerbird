// 拾取型填空（物品/人物）分支流程的运行时冒烟测试
// 用法: node tools/test_pickup_branch.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'file:///C:/Users/chris/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

const TEST_STORY = {
    startScene: 'test_pickup',
    data: {
        clues: {},
        items: {
            '圆顶软帽': { name: '圆顶软帽', desc: '一顶破旧的软帽。' },
            '匕首': { name: '匕首', desc: '一把随身匕首。' }
        },
        notes: {},
        characters: {}
    },
    speakers: {},
    combinations: {},
    scenes: [
        {
            id: 'test_pickup',
            owner: 'shan',
            bg: 'cloudy',
            story: '# 测试\n{填:圆顶软帽}就掉在不远处，她弯腰去捡。',
            initBlocks: [],
            slotBranches: {
                '圆顶软帽': {
                    '圆顶软帽': { correct: true },
                    '匕首': { wrong: true, line: '她伸手摸向匕首，却想起这并不属于此刻。' }
                }
            }
        }
    ]
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// 移除 story.js（它会定义真实剧本并覆盖 window.__STORY__），改为注入测试剧本，确保主脚本前就位
html = html.replace(
    /<script src="story\.js"><\/script>/,
    '<script>window.__STORY__ = ' + JSON.stringify(TEST_STORY) + ';</script>'
);

const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });
const vc = new VirtualConsole();
vc.on('jsdomError', e => { console.log('[jsdomError] ' + (e && e.message)); });

const dom = new JSDOM(html, {
    url: 'file://' + path.join(root, 'index.html'),
    runScripts: 'dangerously',
    resources: 'usable',
    virtualConsole: vc,
    beforeParse(window) {
        window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
        window.requestAnimationFrame = () => 0;
        window.cancelAnimationFrame = () => {};
    }
});

const { window } = dom;
const { document } = window;

function step(msg, fn) {
    try { fn(); console.log('✓ ' + msg); }
    catch (e) { console.log('✗ ' + msg + ' — ' + e.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await new Promise(r => setTimeout(r, 600));

// 逐行推进剧情（打字机逐行显示），直到填空槽出现
async function advanceToSlot(maxClicks) {
    for (let i = 0; i < (maxClicks || 14); i++) {
        if (document.querySelector('#storyArea .slot')) return true;
        document.getElementById('storyArea').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 130));
    }
    return !!document.querySelector('#storyArea .slot');
}

const reached = await advanceToSlot(14);
if (!reached) {
    console.log('[debug] #storyArea.innerHTML =', (document.getElementById('storyArea') || {}).innerHTML?.slice(0, 250));
}

step('拾取型空位已渲染（data-pickup=item）', () => {
    const slot = document.querySelector('#storyArea .slot');
    assert(slot, '找不到填空槽');
    assert(slot.dataset.pickup === 'item', '应为物品拾取型，实际=' + slot.dataset.pickup);
    assert(slot.dataset.expect === '圆顶软帽', '期望应为圆顶软帽');
});

const slot = document.querySelector('#storyArea .slot');
const slotUndo = () => slot.querySelector('.slot-undo');

step('点击空位弹出分支选择框（2 个选项）', () => {
    slot.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const modal = document.getElementById('pickupChoiceModal');
    assert(modal.classList.contains('open'), '选择框未打开');
    const opts = document.querySelectorAll('#pickupChoiceList .fill-item');
    assert(opts.length === 2, '应有 2 个选项，实际=' + opts.length);
});

step('选择错误分支（匕首）：标记 branch-wrong + 追加分支文字 + 收集匕首', () => {
    const opts = [...document.querySelectorAll('#pickupChoiceList .fill-item')];
    const wrong = opts.find(o => o.textContent.includes('匕首'));
    assert(wrong, '找不到匕首选项');
    wrong.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert(slot.classList.contains('branch-wrong'), '错误分支未标记 branch-wrong');
    assert(slot.classList.contains('filled'), '空位未标记 filled');
    const line = document.querySelector('#storyArea .branch-line');
    assert(line && line.textContent.includes('匕首'), '未追加错误分支文字');
    assert(document.getElementById('itemList').innerHTML.includes('匕首'), '匕首未进入物品栏');
    assert(!document.getElementById('pickupChoiceModal').classList.contains('open'), '选择框未关闭');
});

step('点 ↺ 回到填空之前：清空空位与分支文字', () => {
    const u = slotUndo();
    assert(u, '找不到 ↺ 按钮');
    u.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert(!slot.classList.contains('filled'), '空位仍显示已填');
    assert(!slot.classList.contains('branch-wrong'), 'branch-wrong 未清除');
    assert(!document.querySelector('#storyArea .branch-line'), '分支文字未移除');
});

step('重新点击并选择正确（圆顶软帽）：收集且非 branch-wrong', () => {
    slot.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert(document.getElementById('pickupChoiceModal').classList.contains('open'), '再次选择框未打开');
    const opts = [...document.querySelectorAll('#pickupChoiceList .fill-item')];
    const right = opts.find(o => o.textContent.includes('圆顶软帽'));
    assert(right, '找不到圆顶软帽选项');
    right.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert(slot.classList.contains('filled'), '圆顶软帽未填入');
    assert(!slot.classList.contains('branch-wrong'), '正确填法不应为 branch-wrong');
    assert(document.getElementById('itemList').innerHTML.includes('圆顶软帽'), '圆顶软帽未进入物品栏');
});

console.log(process.exitCode ? '✗ 存在失败用例' : '✓ 全部通过');
