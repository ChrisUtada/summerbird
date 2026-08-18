// 拾取型填空「未配置分支」行为冒烟测试：
//  - 点击空位必须弹选择框，绝不能直接填入
//  - 点击选项才填入（收集物品）
//  - 拖入正确物品卡 → 填入；拖入错误物品卡 → 拒绝
// 用法: node tools/test_pickup_unbranched.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'file:///C:/Users/chris/.workbuddy/binaries/node/workspace/node_modules/jsdom/lib/api.js';

function buildStory(extraItems) {
    const items = Object.assign({ '纸片': { name: '纸片', desc: '皱巴巴的纸条。' } }, extraItems || {});
    return {
        startScene: 'test_un',
        data: { clues: {}, items: items, notes: {}, characters: {} },
        speakers: {}, combinations: {},
        scenes: [
            { id: 'test_un', owner: 'shan', bg: 'cloudy', story: '# 测试\n商难接过了{填:纸片}，皱巴巴的。', initBlocks: [] }
        ]
    };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });

async function loadDom(story) {
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    html = html.replace(
        /<script src="story\.js"><\/script>/,
        '<script>window.__STORY__ = ' + JSON.stringify(story) + ';</script>'
    );
    const vc = new VirtualConsole();
    vc.on('jsdomError', e => { console.log('[jsdomError] ' + (e && e.message)); });
    const dom = new JSDOM(html, {
        url: 'file://' + path.join(root, 'index.html'),
        runScripts: 'dangerously', resources: 'usable', virtualConsole: vc,
        beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => fakeCtx; w.requestAnimationFrame = () => 0; w.cancelAnimationFrame = () => {}; }
    });
    await new Promise(r => setTimeout(r, 600));
    // 推进剧情到填空槽出现
    for (let i = 0; i < 14; i++) {
        if (dom.window.document.querySelector('#storyArea .slot')) break;
        dom.window.document.getElementById('storyArea').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 120));
    }
    return dom;
}

function step(msg, fn) {
    try { fn(); console.log('✓ ' + msg); }
    catch (e) { console.log('✗ ' + msg + ' — ' + e.message); process.exitCode = 1; }
}
function assert(c, m) { if (!c) throw new Error(m); }
function fakeDrop(win, slot, blockId) {
    const ev = new win.Event('drop', { bubbles: true });
    ev.dataTransfer = { getData: () => blockId };
    slot.dispatchEvent(ev);
}

// ---------- 场景 A：点击路径（不直填，弹框后点选项） ----------
{
    const dom = await loadDom(buildStory());
    const { window } = dom;
    const document = window.document;
    const slot = document.querySelector('#storyArea .slot');
    step('未配分支拾取空位已渲染 data-pickup=item', () => {
        assert(slot, '找不到空位');
        assert(slot.dataset.pickup === 'item', '应为 item，实际=' + slot.dataset.pickup);
        assert(slot.dataset.expect === '纸片', '期望应为纸片');
    });
    step('点击空位：弹选择框（1 选项）且【未直接填入】', () => {
        slot.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        const modal = document.getElementById('pickupChoiceModal');
        assert(modal.classList.contains('open'), '选择框未打开');
        const opts = document.querySelectorAll('#pickupChoiceList .fill-item');
        assert(opts.length === 1, '未配分支应只有 1 个正确选项，实际=' + opts.length);
        assert(!slot.classList.contains('filled'), '不应直接填入（不应已 filled）');
        assert(!slot.querySelector('.slot-content'), '不应出现已填内容');
    });
    step('点击选项：收集纸片并填入', () => {
        const opt = document.querySelector('#pickupChoiceList .fill-item');
        opt.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        assert(slot.classList.contains('filled'), '点击选项后未填入');
        assert(!slot.classList.contains('branch-wrong'), '正确填法不应 branch-wrong');
        assert(document.getElementById('itemList').innerHTML.includes('纸片'), '纸片未进入物品栏');
        assert(!document.getElementById('pickupChoiceModal').classList.contains('open'), '选择框未关闭');
    });
}

// ---------- 场景 B：拖入正确物品卡 ----------
{
    const dom = await loadDom(buildStory());
    const { window } = dom;
    const document = window.document;
    const slot = document.querySelector('#storyArea .slot');
    step('拖入正确物品卡（item_纸片）：填入并收集', () => {
        fakeDrop(window, slot, 'item_纸片');
        assert(slot.classList.contains('filled'), '拖入正确卡未填入');
        assert(!slot.classList.contains('branch-wrong'), '正确卡不应 branch-wrong');
        assert(document.getElementById('itemList').innerHTML.includes('纸片'), '纸片未进入物品栏');
    });
}

// ---------- 场景 C：拖入错误物品卡（应拒绝） ----------
{
    const dom = await loadDom(buildStory({ '钥匙': { name: '钥匙', desc: '一把钥匙。' } }));
    const { window } = dom;
    const document = window.document;
    const slot = document.querySelector('#storyArea .slot');
    step('拖入错误物品卡（item_钥匙）：拒绝，不填入', () => {
        fakeDrop(window, slot, 'item_钥匙');
        assert(!slot.classList.contains('filled'), '错误卡不应填入');
        assert(!document.getElementById('itemList').innerHTML.includes('钥匙'), '错误卡不应进入物品栏');
    });
}

console.log(process.exitCode ? '✗ 存在失败用例' : '✓ 全部通过');
