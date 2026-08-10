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

const compiled = SBCompiler.compileScenes(STORY.scenes, {
    speakers: STORY.speakers,
    ids: {
        char: DATA.characters,
        clue: Object.assign({}, DATA.clues, DATA.items),
        note: DATA.notes
    }
});
compiled.warnings.forEach(w => errors.push('[编译] ' + w));

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

    (sc.slotConfigs || []).forEach(cfg => {
        if (!blockIds.has(cfg.expected)) errors.push('[' + id + '] 槽 ' + cfg.id + ' 期望块不存在: ' + cfg.expected);
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
    while ((m = expectRe.exec(story))) if (!blockIds.has(m[1])) errors.push('[' + id + '] data-expect 块不存在: ' + m[1]);
}

for (const key of Object.keys(STORY.combinations || {})) {
    const combo = STORY.combinations[key];
    key.split('+').forEach(part => {
        if (!allClueIds.has(part)) errors.push('[组合 ' + key + '] 条目不存在: ' + part);
    });
    if (combo.noteId && !DATA.notes[combo.noteId]) errors.push('[组合 ' + key + '] noteId 不存在: ' + combo.noteId);
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
