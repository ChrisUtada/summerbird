/*
 * 内容校验脚本
 * 用法: node tools/validate.mjs
 * 检查 story.js 中所有引用的完整性（场景跳转、填空块、高亮词、组合、奖励），
 * 并在真实编译器中编译剧本以捕获 DSL 错误。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const compilerSrc = fs.readFileSync(path.join(root, 'compiler.js'), 'utf8');
const SBCompiler = new Function(compilerSrc + '; return globalThis.SBCompiler;')();

const storySrc = fs.readFileSync(path.join(root, 'story.js'), 'utf8');
const STORY = JSON.parse(storySrc.replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, ''));

const errors = [];
const warnings = [];

const DATA = STORY.data || {};
const allClueIds = new Set([...Object.keys(DATA.clues || {}), ...Object.keys(DATA.items || {})]);

// 分支引用解析：物品/人物/线索 的 id 与 name 都可作为分支键
const branchRefSet = new Set([...allClueIds, ...Object.keys(DATA.characters || {})]);
const branchNameToId = {};
Object.keys(DATA.items || {}).forEach(id => { branchNameToId[DATA.items[id].name || id] = id; });
Object.keys(DATA.characters || {}).forEach(id => { branchNameToId[DATA.characters[id].name || id] = id; });
Object.keys(DATA.clues || {}).forEach(id => { if (DATA.clues[id].name) branchNameToId[DATA.clues[id].name] = id; });

// 线索字段校验：removeAfterCombine 必须为布尔值
for (const k of Object.keys(DATA.clues || {})) {
    const c = DATA.clues[k];
    if (c.removeAfterCombine !== undefined && typeof c.removeAfterCombine !== 'boolean') {
        errors.push('[线索 ' + k + '] removeAfterCombine 必须为布尔值');
    }
}

const compiled = SBCompiler.compileScenes(STORY.scenes, {
    speakers: STORY.speakers,
    ids: {
        char: DATA.characters,
        clue: Object.assign({}, DATA.clues, DATA.items),
        item: DATA.items,
        note: DATA.notes
    }
});
compiled.warnings.forEach(w => warnings.push('[编译] ' + w));

const scenes = compiled.scenes;
const ids = Object.keys(scenes);
if (ids.length === 0) errors.push('没有任何场景');
const rawIds = (STORY.scenes || []).map(s => s && s.id);
rawIds.filter((id, i) => id && rawIds.indexOf(id) !== i)
    .forEach(d => errors.push('场景 id 重复: ' + d));
if (STORY.startScene && !scenes[STORY.startScene]) errors.push('startScene 不存在: ' + STORY.startScene);
if (!STORY.startScene) warnings.push('未设置 startScene，将默认使用第一个场景');

for (const id of ids) {
    const sc = scenes[id];
    if (!['wu', 'shan', 'all'].includes(sc.owner)) warnings.push('[' + id + '] owner 未知: ' + sc.owner);
    if (!['cloudy', 'rain', 'night'].includes(sc.bg)) warnings.push('[' + id + '] bg 未知: ' + sc.bg);
    if (sc.goto && !scenes[sc.goto]) errors.push('[' + id + '] goto 指向不存在的场景: ' + sc.goto);

    const blocks = sc.initBlocks || [];
    const blockIds = new Set(blocks.map(b => b.id));
    if (blockIds.size !== blocks.length) errors.push('[' + id + '] initBlocks 存在重复 id');
    blocks.forEach(b => {
        if (!['reason', 'item', 'char'].includes(b.type)) errors.push('[' + id + '] 块 ' + b.id + ' type 非法: ' + b.type);
        if (b.type === 'char' && b.sourceId && !DATA.characters[b.sourceId]) errors.push('[' + id + '] 人物块 ' + b.id + ' sourceId 不存在: ' + b.sourceId);
    });

    // 合法的「填空期望块」来源：initBlocks / 组合产出的 block（id 或 label）/ 线索+物品 / 角色
    const comboBlockNames = new Set();
    for (const key of Object.keys(STORY.combinations || {})) {
        const blk = STORY.combinations[key] && STORY.combinations[key].block;
        if (blk) { if (blk.id) comboBlockNames.add(blk.id); if (blk.label) comboBlockNames.add(blk.label); }
    }
    const characterIds = new Set(Object.keys(DATA.characters || {}));
    (sc.slotConfigs || []).forEach(cfg => {
        if (cfg.pickup) return; // 拾取型空位（物品/人物）由点击收集，无预置块
        const valid = blockIds.has(cfg.expected) || allClueIds.has(cfg.expected) ||
            characterIds.has(cfg.expected) || comboBlockNames.has(cfg.expected);
        if (!valid) errors.push('[' + id + '] 槽 ' + cfg.id + ' 期望块不存在: ' + cfg.expected);
    });

    // 填空分支校验：分支键应为已知线索/物品/人物或组合结果（id 或 name）
    // 类型规则：线索空位只填线索/推理结果，物品空位只填物品，人物空位只填人物
    const sceneSlotRefs = new Set((sc.slotConfigs || []).map(c => c.ref));
    const comboNames = new Set();
    for (const key of Object.keys(STORY.combinations || {})) {
        const blk = STORY.combinations[key] && STORY.combinations[key].block;
        if (blk) { if (blk.id) comboNames.add(blk.id); if (blk.label) comboNames.add(blk.label); }
    }
    const branchValid = new Set([...branchRefSet, ...comboNames]);
    const slotTypeOf = function (ref) {
        const id = branchNameToId[ref] || ref;
        if (DATA.items[id]) return 'item';
        if (DATA.characters[id]) return 'char';
        return 'clue';
    };
    const answerTypeOf = function (ans) {
        const id = branchNameToId[ans] || ans;
        if (DATA.items[id]) return 'item';
        if (DATA.characters[id]) return 'char';
        return 'clue'; // 线索与组合结果（推理）均视为线索类
    };
    Object.keys(sc.slotBranches || {}).forEach(function (ref) {
        const map = sc.slotBranches[ref];
        if (!map) return;
        if (!sceneSlotRefs.has(ref)) warnings.push('[' + id + '] slotBranches 引用了不存在的填空位: ' + ref);
        const st = slotTypeOf(ref);
        Object.keys(map).forEach(function (ans) {
            const v = map[ans];
            if (!v) return;
            if (!branchValid.has(ans) && !branchNameToId[ans]) {
                warnings.push('[' + id + '] slotBranches 分支「' + ans + '」不是已知线索/物品/人物/组合结果');
                return;
            }
            const at = answerTypeOf(ans);
            const ok = st === 'clue' ? at === 'clue' : at === st;
            if (!ok) {
                warnings.push('[' + id + '] slotBranches 分支「' + ans + '」是' +
                    (at === 'item' ? '物品' : at === 'char' ? '人物' : '线索') + '，与填空「' + ref + '」的' +
                    (st === 'item' ? '物品' : st === 'char' ? '人物' : '线索') + '类型不符，该分支不会出现');
            }
        });
    });

    (sc.rewards || []).forEach(r => {
        if (!['note', 'clue', 'item'].includes(r.type)) errors.push('[' + id + '] reward type 非法: ' + r.type);
        if (r.type === 'note' && !DATA.notes[r.id]) errors.push('[' + id + '] reward 笔记不存在: ' + r.id);
        if (r.type === 'clue' && !DATA.clues[r.id]) errors.push('[' + id + '] reward 线索不存在: ' + r.id);
        if (r.type === 'item' && !DATA.items[r.id]) errors.push('[' + id + '] reward 物品不存在: ' + r.id);
    });

    const story = sc.story || '';
    let m;
    const charRe = /data-char="([^"]+)"/g;
    while ((m = charRe.exec(story))) if (!DATA.characters[m[1]]) errors.push('[' + id + '] data-char 不存在: ' + m[1]);
    const clueRe = /data-clue="([^"]+)"/g;
    while ((m = clueRe.exec(story))) if (!allClueIds.has(m[1])) errors.push('[' + id + '] data-clue 不存在: ' + m[1]);
    const noteRe = /data-note="([^"]+)"/g;
    while ((m = noteRe.exec(story))) if (!DATA.notes[m[1]]) errors.push('[' + id + '] data-note 不存在: ' + m[1]);
    const expectRe = /data-expect="([^"]+)"/g;
    while ((m = expectRe.exec(story))) {
        const exp = m[1];
        const valid = blockIds.has(exp) || allClueIds.has(exp) || characterIds.has(exp) || comboBlockNames.has(exp);
        if (!valid) errors.push('[' + id + '] data-expect 块不存在: ' + exp);
    }
}

for (const key of Object.keys(STORY.combinations || {})) {
    const combo = STORY.combinations[key];
    const parts = key.split('+');
    const sorted = [...parts].sort().join('+');
    if (sorted !== key) errors.push('[组合 ' + key + '] key 未按字母排序，应为: ' + sorted);
    parts.forEach(part => {
        if (!allClueIds.has(part)) errors.push('[组合 ' + key + '] 条目不存在: ' + part);
    });
    if (combo.noteId && !DATA.notes[combo.noteId]) errors.push('[组合 ' + key + '] noteId 不存在: ' + combo.noteId);
    if (combo.block) {
        if (!combo.block.id || !combo.block.label) errors.push('[组合 ' + key + '] block 缺少 id/label');
        if (combo.block.detail === undefined) errors.push('[组合 ' + key + '] block 缺少 detail 字段');
    }
}

console.log('场景: ' + ids.length + ' | 线索: ' + Object.keys(DATA.clues || {}).length +
    ' | 物品: ' + Object.keys(DATA.items || {}).length +
    ' | 笔记: ' + Object.keys(DATA.notes || {}).length +
    ' | 角色: ' + Object.keys(DATA.characters || {}).length +
    ' | 组合: ' + Object.keys(STORY.combinations || {}).length);
warnings.forEach(w => console.log('WARN: ' + w));
errors.forEach(e => console.log('ERROR: ' + e));
const ok = errors.length === 0;
console.log(ok ? '✓ 校验通过' : '✗ 校验失败：' + errors.length + ' 个错误');
process.exit(ok ? 0 : 1);
