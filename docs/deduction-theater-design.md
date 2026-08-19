# 推理小剧场（Deduction Theater）—— 最小原型设计提案

> 状态：设计阶段，未实现。本文档定义**数据结构、DSL 扩展、状态机与回填契约**，供实现参考。
> 目标：把右上「推理结果」面板从"组合卡片"升级为可交互的推理小剧场。玩家在剧场内对话、质疑、选择，推导正确后把结论回填主剧情填空位并推进主线；推导错误则播放支线并支持重来。

---

## 1. 现状数据流（index.html 右侧「推理结果」）

```
玩家在中间剧情点击 {k:线索} 高亮 → 线索进入"已收集"
玩家在右侧选择若干线索 → 命中 COMBINATIONS 中某条 → 展示产出卡片（静态文本）
```

问题：产出卡片是单向展示，没有"推理过程"，也没有对错分支，玩家只是"拼对了就出结果"。

---

## 2. 目标数据流（引入演绎层）

```
玩家选择若干线索 → 命中某个 trial 的配置（needed 齐备）→ 弹出「推理小剧场」面板
   → 剧场内：角色对话 + 玩家选择/质疑（复用 @ 语法）
   → 玩家做出关键选择：
       命中正确分支 __correct → 调用 unlock：把主剧情的【填空】位替换为 answer，推进主线
       命中错误分支 __wrong  → 播放错误支线场景 + 显示「重来」按钮（保留已收集线索）
```

关键约束：
- **普通组合**（信息整合类）保持原样，直接出卡片，不进剧场。
- **只有标记为 trial 的关键推断**才进剧场（避免节奏拖沓）。
- 错误不惩罚剧情进度，只给支线反馈，鼓励试错。

---

## 3. 数据模型扩展

### 3.1 顶层新增 `STORY.trials`

挂在 `story.js` 顶层，与 `scenes`、`combinations` 平级：

```js
STORY.trials = {
  nine_leaf: {
    id: "nine_leaf",
    title: "小标志与失踪",                 // 小剧场面板标题
    needed: ["九片树叶组成的小标志", "孩童开始失踪"], // 触发所需已收集线索（label 匹配）
    enterScene: "theater_nine_leaf_intro", // 进入剧场后的起始 scene id
    unlock: {                              // 命中 __correct 时执行
      sceneId: "chapter0104",             // 推进到哪个主剧情 scene
      fillId: "九头金乌",                 // 主剧情中待回填的【填空】block id
      answer: "罗刹鸟"                    // 回填文本
    }
  }
  // 后续可加更多 trial...
}
```

> 注：若希望不新增顶层字段，也可在 `combinations` 某条上追加 `trial: { enterScene, unlock }`，由引擎识别后改为进剧场。本文档采用独立 `trials` 以隔离职责。

### 3.2 小剧场场景写在 `STORY.scenes` 中

复用现有 `@说话人: 台词` / `# 标题` / `---` / `{c/k/n}` / `【填空】` 语法，只需在 scene 加 `kind: "theater"` 以区分：

```js
STORY.scenes.theater_nine_leaf_intro = {
  id: "theater_nine_leaf_intro",
  kind: "theater",
  bg: "cloudy",
  story: `
# 小剧场 · 小标志与失踪
@商难: 九片树叶的记号，和孩童失踪，这两件事看着毫不相干。
@吴秋崖: 未必。树叶若按方位排列，正好圈出村后那片枯林——
@张道诚: （冷笑）你们不会真信什么金乌作祟吧？
? 你要如何推进推理：
  - 质疑张道诚的轻蔑 | theater_nine_leaf_q1
  - 顺着吴秋崖的思路继续 | theater_nine_leaf_q1
`
};
```

#### 选择行语法（新增）

在剧场场景中，以 `?` 开头的行表示玩家选项：

```
? 提示文本：
  - 选项A文案 | 目标sceneId 或 __correct / __wrong
  - 选项B文案 | 目标sceneId 或 __correct / __wrong
```

- 指向另一个 `kind:"theater"` 的 scene → 继续剧场对话。
- 指向哨兵 `__correct` → 引擎执行该 trial 的 `unlock`。
- 指向哨兵 `__wrong`  → 引擎跳到该 trial 的 `wrongScene`（或默认支线）。

### 3.3 错误支线场景

```js
STORY.scenes.theater_nine_leaf_wrong = {
  id: "theater_nine_leaf_wrong",
  kind: "theater",
  isWrong: true,                 // 引擎据此在末尾自动渲染「重来」按钮
  story: `
@张道诚: 呵，就凭这片树叶？你连金乌怎么害人都没搞清楚。
@商难: （若有所思）……他说的，好像也有点道理。
# —— 线索不足，推理中断 ——
（重来按钮将出现在此处）
`
};
```

`isWrong: true` 的剧场场景渲染完成后，面板底部自动出现：
- **「重新推理」**：重置本 trial 的剧场进度（回到 `enterScene`），保留已收集线索。
- **「返回剧情」**（可选）：关闭剧场，回到主剧情当前节点。

---

## 4. 状态机

```
[idle]
   │ 玩家线索集 ⊇ trial.needed
   ▼
[armed]  （右侧出现"可推理"提示，点击进入）
   │
   ▼
[theater]  → 渲染 enterScene
   │ 玩家每轮选择
   ├─→ 指向 theater scene → 继续 [theater]
   ├─→ __correct → [unlocked]：执行 unlock，回填主剧情，关闭面板，推进主线
   └─→ __wrong   → [wrong]：渲染 isWrong 场景 → 显示「重来」
                                          │
                              ┌───────────┴───────────┐
                          [重来] 回到 [theater]    [返回剧情] 回到 [idle]
```

状态保存在引擎侧（如 `gameState.trial`），与现有 `state.scene` 解耦，避免污染主剧情进度。

---

## 5. 回填主剧情的契约

主剧情 `chapter0104` 的 `story` 中保留占位：

```
附身在那个村子里的，并非只有【填空:九头金乌】。
```

命中 `__correct` 时，引擎执行 `unlock`：
1. 将主剧情编译产物中 `data-expect="九头金乌"` 的 slot 替换为 `answer`（"罗刹鸟"），并从"待填"变为"已填定稿"。
2. 调用 `gotoChapter("chapter0104")`（或在原 scene 处理完后继续推进）。
3. 关闭小剧场面板。

> 若玩家尚未进入 chapter0104，则先缓存 unlock 结果，进入该 scene 渲染时自动套用，避免占位暴露。

---

## 6. 引擎侧需新增/修改的接口清单（仅列契约，不写实现）

| 模块 | 改动 |
|---|---|
| `compiler.js` | 识别 `?` 选择行；`kind:"theater"` / `isWrong` scene 正常解析；选项目标支持 `__correct`/`__wrong` 哨兵 |
| `index.html` 渲染层 | 新增「推理小剧场」面板容器（覆盖或侧滑于右侧「推理结果」之上）；渲染 theater scene；在 `isWrong` 场景后注入「重来 / 返回」按钮 |
| 状态管理 | 新增 `trial` 状态：当前 trial id、剧场 scene 栈、是否 solved；`needed` 命中检测 |
| 交互 | 右侧"组合"命中 trial 时，改为"进入小剧场"而非出卡片；选择点击回调驱动状态机 |
| 回填 | `unlock` 执行器：替换 slot + 触发 goto |
| `editor.html` | 预览区支持 `?` 选择行与 `kind:"theater"` 场景的展示（可选，便于作者调试） |

---

## 7. 最小原型范围（建议首版交付）

只做 **1 个** trial，复用 chapter0103 末尾已埋的 `【填空:九头金乌】` 钩子：

- trial：`nine_leaf`（九片树叶 + 孩童失踪 → 罗刹鸟）
- 1 个正确分支（回填"罗刹鸟"，推进 chapter0104）
- 1 个错误分支（给额外线索 + 重来）
- 1 个重来按钮 + 1 个返回按钮

跑通后再批量迁移其他关键推断。

---

## 8. 设计要点回顾（避免踩坑）

1. **分层**：普通组合仍出卡片；仅关键推断进剧场。
2. **错误有收益**：错误支线给出额外线索/隐藏笔记，避免"错了白错"。
3. **重来只重置剧场**：已收集线索保留，降低试错成本。
4. **节奏**：单场剧场 3–6 轮对话，不抢主线节奏。
5. **回填解耦**：unlock 缓存机制保证未进入目标 scene 前不暴露答案。
