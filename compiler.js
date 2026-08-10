/*
 * summerbird DSL 编译器
 * 将 story.js 中的剧本标记文本编译为引擎可用的 HTML 行。
 * 浏览器与 Node 共用（window / globalThis 挂载 SBCompiler）。
 *
 * 剧本行语法（每行一个块）：
 *   # 标题文字          → 章节标题行（首行自动成为 chapter-title）
 *   @说话人: 台词       → 台词行（说话人可写名字，如「张道诚」，或样式键 old/wu/shan/zhang）
 *   ---                 → 分隔线
 *   其他文本            → 叙述行
 *
 * 行内标记：
 *   {c:角色id}文字{/}        → 人物高亮（点击加入人物框）
 *   {k:线索或物品id}文字{/}  → 线索/物品高亮（点击收集）
 *   {n:笔记id}文字{/}        → 笔记高亮（解锁后可查看）
 *   【填空:块id】              → 拖拽填空位（块 id 或标签均可，将自动生成 slot id）
 */
(function (global) {
    'use strict';

    const HL_RE = /\{([ckn]):([^{}]+)\}([\s\S]*?)\{\/\}/g;
    const SLOT_RE = /【填空:([^】]+)】/g;
    const DIVIDER = '<hr class="divider" />';

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function warn(ctx, msg) {
        ctx.warnings.push(msg);
        if (typeof console !== 'undefined' && console.warn) console.warn('[SBCompiler] ' + msg);
    }

    function resolveBlock(ref, blocks) {
        const byId = blocks.find(b => b.id === ref);
        if (byId) return byId;
        const byLabel = blocks.filter(b => b.label === ref);
        if (byLabel.length === 1) return byLabel[0];
        return null;
    }

    function resolveSpeaker(token, ctx) {
        const speakers = ctx.speakers || {};
        if (speakers[token]) return { cls: token, name: speakers[token] };
        for (const cls in speakers) {
            if (speakers[cls] === token) return { cls: cls, name: token };
        }
        warn(ctx, '未知说话人「' + token + '」，已按默认样式处理');
        return { cls: 'old', name: token };
    }

    // 行内标记 → HTML
    function inline(text, blocks, slotConfigs, nextSlotId, ctx) {
        text = text.replace(HL_RE, function (all, kind, id, content) {
            const cid = id.trim();
            if (kind === 'c') {
                if (ctx.ids.char && !ctx.ids.char[cid]) warn(ctx, '人物高亮引用了不存在的角色: ' + cid);
                return '<span class="char-highlight" data-char="' + cid + '">' + content + '</span>';
            }
            if (kind === 'k') {
                if (ctx.ids.clue && !ctx.ids.clue[cid]) warn(ctx, '线索高亮引用了不存在的条目: ' + cid);
                return '<span class="clue-highlight" data-clue="' + cid + '">' + content + '</span>';
            }
            if (ctx.ids.note && !ctx.ids.note[cid]) warn(ctx, '笔记高亮引用了不存在的笔记: ' + cid);
            return '<span class="note-highlight" data-note="' + cid + '">' + content + '</span>';
        });
        text = text.replace(SLOT_RE, function (all, ref) {
            const block = resolveBlock(ref.trim(), blocks);
            if (!block) {
                warn(ctx, '填空「' + ref.trim() + '」未找到对应块（检查 initBlocks）');
                return all;
            }
            const slotId = nextSlotId();
            slotConfigs.push({ id: slotId, expected: block.id, label: block.label });
            return '<span class="slot" data-slot="' + slotId + '" data-expect="' + block.id +
                '" data-answer="' + block.label + '"><span class="placeholder">______</span></span>';
        });
        return text;
    }

    function compileLine(line, blocks, slotConfigs, nextSlotId, ctx) {
        if (line === '---') return DIVIDER;
        let m = line.match(/^#\s+([\s\S]+)$/);
        if (m) return '<div class="narr-line">✦ ' + escapeHtml(m[1]) + ' ✦</div>';
        m = line.match(/^@([^:：]+)[:：]\s*([\s\S]+)$/);
        if (m) {
            const sp = resolveSpeaker(m[1].trim(), ctx);
            const body = inline(m[2], blocks, slotConfigs, nextSlotId, ctx);
            return '<div class="msg"><span class="speaker ' + sp.cls + '">' + sp.name +
                '</span><span class="text">' + body + '</span></div>';
        }
        return '<div class="narr-line">' + inline(line, blocks, slotConfigs, nextSlotId, ctx) + '</div>';
    }

    function compileScene(scene, ctx) {
        const blocks = scene.initBlocks || [];
        const slotConfigs = [];
        let slotSeq = 0;
        const nextSlotId = function () { slotSeq++; return 'slot_' + slotSeq; };
        const lines = String(scene.story || '').split('\n').map(s => s.trim()).filter(Boolean);
        const story = lines.map(l => compileLine(l, blocks, slotConfigs, nextSlotId, ctx)).join('\n');
        return Object.assign({}, scene, { story: story, slotConfigs: slotConfigs });
    }

    // scenes: 数组；options: { speakers, ids: { char, clue, note } }
    // 返回 { scenes: {id: scene}, warnings: [] }
    function compileScenes(scenes, options) {
        const ctx = {
            speakers: (options && options.speakers) || {},
            ids: (options && options.ids) || {},
            warnings: []
        };
        const result = {};
        (scenes || []).forEach(function (scene) {
            if (!scene || !scene.id) {
                warn(ctx, '场景缺少 id，已跳过');
                return;
            }
            if (result[scene.id]) warn(ctx, '场景 id 重复: ' + scene.id);
            result[scene.id] = compileScene(scene, ctx);
        });
        return { scenes: result, warnings: ctx.warnings };
    }

    global.SBCompiler = { compileScenes: compileScenes };
})(typeof window !== 'undefined' ? window : globalThis);
