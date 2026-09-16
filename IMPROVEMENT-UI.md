# UI 改进项 — better-ui 审查

审查对象：`src/react-app`（79 个文件中的全部 UI 面）。
审查依据：`better-ui` skill（`surfaces.md` / `animations.md` / `enter-exit.md` / `icon-transitions.md` / `icons.md` / `performance.md`）。

> **本文件只是计划，不包含任何代码改动。** 每一步都是独立可提交的一步（沿用仓库约定：一步一 commit，不 push）。
>
> **注意**：开始执行前读了 `node_modules/@heroui/styles` 的真实样式，有若干条计划被修正 —— 见 [第 6 节](#6-执行前的研究修正)，**第 6 节的结论优先于第 1 节**。

---

## 0. 审查结论

| 项 | 结果 |
| --- | --- |
| 结论 | **Block** — 存在 2 项 HIGH，必须修复后才谈"好看" |
| 覆盖 | `pages/` 5 个页面、`components/files/`（含 `preview/`）、`components/storage/`、`components/common/`、`hooks/`、`index.css`、`index.html` |
| 未覆盖 | `src/worker`（不在本次范围） |
| 未验证 | 本机 `node_modules` 未安装、无浏览器。**以下内容未运行验证**：(1) HeroUI `Card`/`Button` 的实际圆角、阴影、按下反馈取值；(2) 各 `--*-soft` 色板（HeroUI 提供）与 `--accent` 的实测对比度；(3) 真实交互下的动效回放。相关行已在表中标注 `未验证`。

### 目标形态（"好看好用"在这里的具体含义）

1. **一套图标**：全部为 `stroke="currentColor"` 的 SVG，同一描边粗细，状态靠颜色/透明度而非换图形。
2. **一套面**：卡片、浮层、按钮的"边"来自分层 `box-shadow`；分隔线才用 `border`。
3. **一套控件**：输入框/下拉只有一个类名定义，圆角取自 `--field-radius`，过渡只声明会变的属性。
4. **好用**：键盘焦点永远可见；加载不跳版；空状态给下一步动作；不存在不可达的死样式。

---

## 1. 按原则分组的改进项

### 1.1 按下反馈与可中断动画（animations.md）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| **HIGH** | `index.css:231-236` | `button:active:not(:disabled), a:active { transform: scale(0.96); transition: transform 100ms cubic-bezier(0.2,0,0,1); }` — `transition` 写在 `:active` 里 | 把过渡提到基础态：`button { transition-property: scale; transition-duration: 150ms; transition-timing-function: ease-out; } button:active:not(:disabled) { scale: 0.96; }` | 过渡属性在离开 `:active` 时随规则一起消失，**按下有动画、松手是瞬跳**，这就是"不可中断的动画"最典型的写法。全站每个按钮都受影响 |
| MEDIUM | `index.css:231-236` | 规则命中**所有** `button`，含 HeroUI 渲染的按钮、`FileTable` 排序表头、`Pager` 数字、`PathBar` 面包屑、`StorageTable` 行内小按钮等高频繁控件 | 1) 用 `:not([data-static])` 或一个 `.tap` 类限定范围；2) 高频繁小控件（分页数字、面包屑、表头）关掉缩放 | 高频繁交互每次都付动效成本；0.96 缩放在 12px 小按钮上产生肉眼可见的抖动。`a:active` 是**死选择器**（全站没有 `<a>`） |
| MEDIUM | `index.css:231`、`App.tsx:58`、`FilesPage.tsx:624` 等 | 全局规则对 HeroUI `Button` 的 `isDisabled` / `isPending` 是否生效取决于它是否真的渲染 `disabled` 属性；若只出 `aria-disabled`/`data-disabled`，`:not(:disabled)` 仍匹配 | 改成 `:not(:disabled):not([aria-disabled="true"])` `未验证` | 禁用按钮仍会缩放，与"禁用"语义矛盾 |
| LOW | `index.css:233` | 用 `transform: scale()` 而非离散属性 `scale` | 统一用 `scale` | `transform` 是复合属性，会与将来任何 transform 用法互相覆盖 |

### 1.2 状态反馈不能只靠动效（animations.md / "Motion is never the only feedback channel"）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| **HIGH** | `FileTable.tsx:118`、`FileGrid.tsx:48` | 行/瓦片是 `tabIndex={0}` 的可聚焦元素，类名里有 `outline-none`，但**没有任何 `focus-visible` 样式** | 加 `focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`（行）与同样式的圆角版本（瓦片） | Tab 到某一行时屏幕上没有任何变化，而 Enter/Space 会真的作用在它身上。键盘用户**看不见自己在哪** —— 这是"不能用"，不只是不美。完整的焦点体系归 `better-accessibility`，此处只做最小可见化 |
| MEDIUM | `FileGrid.tsx:71-73` | 注释写"hovered, selected **or tabbed to**"，但实现是 `group-hover:opacity-100 focus:opacity-100`——`focus:` 作用于 checkbox 自身，而可聚焦的是外层瓦片 | 用 `group-focus-within:opacity-100`（或 `group-has-[+]:`） | 注释承诺的行为不存在：Tab 到瓦片时勾选框仍然隐藏，看不到"可选中"这个状态 |
| MEDIUM | `Pager.tsx:129-143` | 当前页仅靠 `bg-accent text-accent-foreground`；切换分页时列表内容整体替换，无任何方向提示 | 保留静态色块即可，**不要**加分页动画；但需确认 `--accent` 与 `accent-soft` 上的选中态文字对比度 `未验证` | 当前页有静态线索 ✓；风险在对比度，需与 `better-accessibility` 一起实测 |
| LOW | `FileToolbar.tsx:142-144`、`Pager.tsx:104-106`、`MarkdownViewer.tsx:90-92` | 三处分段控件选中态用 `bg-accent-soft text-accent` | 抽成一个组件后再统一取值 | 三份拷贝已经各自漂移，任何取值调整都要改三处 |

### 1.3 同心圆角（surfaces.md · Concentric border radius）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `SelectionBar.tsx:40` + `SelectionBar.tsx:57` | 外层面板 `rounded-xl`（12px）+ `px-2 py-2`（8px 内边距），内部按钮 `rounded-lg`（8px）。同心要求 12 − 8 = **4px** | 内部按钮改 `rounded`（4px），或把面板内边距改成 `p-1`（4px）配 `rounded-lg`（12 − 4 = 8 ✓） | 浮在列表底部最显眼的控件上，圆角"外小内大"的错位肉眼可辨 |
| MEDIUM | `ContextMenu.tsx:41` + `ContextMenu.tsx:55` | 菜单 `rounded-xl py-1`，菜单项 `block w-full px-3 py-2`**完全没有圆角**，且横向无内缩 | 容器加 `p-1`，项加 `rounded-lg`（反算 12 − 4 = 8） | hover 高亮是一个直角色带，四条边直接切进菜单的圆角里；配合 `overflow-auto` 首/末项的色带会溢出圆角，是右键菜单最常见的"脏" |
| — | `FileToolbar.tsx:134/142`、`Pager.tsx:96/104`、`MarkdownViewer.tsx:82/90`、`StorageFields.tsx:83`、`DriverField.tsx:11` | 外 `rounded-lg`(8) + `p-0.5`(2) + 内 `rounded-md`(6) | **保持** | 8 − 2 = 6 ✓ 这几处是本仓库做对的同心圆角，作为后续修改的基准 |

### 1.4 阴影表达层级，边框表达结构（surfaces.md · Shadows instead of borders）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `index.css`（缺 token） | 全仓没有 `--shadow-border` / `--shadow-border-hover`；卡片/浮层一律 `border border-border` + Tailwind `shadow-sm`/`shadow-lg` 双写 | 在 `:root`/`.dark` 各加一层：`--shadow-border: 0 0 0 1px oklch(0 0 0 / .06), 0 1px 2px -1px oklch(0 0 0 / .06), 0 2px 4px oklch(0 0 0 / .04)`；暗色仅 `0 0 0 1px oklch(1 0 0 / .08)` | 边框是死色，浮层叠在图片、`accent-soft` 高亮行、`surface-secondary` 上时不会自适应；阴影用透明度所以到哪里都对 |
| MEDIUM | `FilesPage.tsx:673` | 列表卡片 `rounded-xl border border-border bg-surface shadow-sm` | 换 `shadow-[var(--shadow-border)]` + `transition-[box-shadow] duration-150 ease-out`，去掉 `border-border` | 全仓唯一的"手写卡片"（其余页面都用 `HeroCard`），所以它是唯一一个圆角/边框/阴影都跟别人不一样的卡片 |
| MEDIUM | `ContextMenu.tsx:41`、`SelectionBar.tsx:40` | 浮层同时有 `border border-border` 和 `shadow-lg` | 同上，用 `--shadow-border` 承担那一圈，保留 `shadow-lg` 的环境层 | 边框 + 大阴影叠加会让浮层边缘发灰、双层描边 |
| LOW | `StoragesPage.tsx:204`、`MetadataPage.tsx:66`、`BackupPage.tsx:55`、`LoginPage.tsx:46` | 四处用 `HeroCard variant="default"` 而列表卡片手写 | 统一：手写卡片改成 `HeroCard className="overflow-hidden p-0"` | 同一种语义两种实现，将来一定会不一致。`未验证`：HeroCard 的实际圆角是否等于 `--radius` |
| LOW | `StorageTable.tsx:80-83` | 状态点写了两遍颜色：`text-success` + `bg-success`（同理 `text-muted`/`bg-muted`） | 点改 `bg-current`，只维护一个状态色 | 双份声明即双份漂移风险 |

### 1.5 图片描边（surfaces.md · Image outlines）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `ImageViewer.tsx:10` | `<img className="max-h-full max-w-full object-contain">`，没有任何描边 | 加 `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10` | 图片容器是 `bg-surface-secondary`，浅色主题下接近白（95% L）。**白底截图/照片的边会消失**，卡片边界随之塌掉。必须用纯黑/纯白透明度，不能用 slate/zinc 这类有色中性色 |

### 1.6 只过渡会变的属性（performance.md）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `LoginPage.tsx:61`、`LoginPage.tsx:72`、`StorageJsonDialog.tsx:16` | 裸 `transition`（Tailwind 会展开到 color/background/border/outline/fill/stroke/opacity/**shadow/transform/translate/scale/rotate**/filter/backdrop-filter） | 改成 `transition-[border-color,box-shadow]` | 一次输入框聚焦会去监听二十来个属性；并且因为包含 `scale`/`transform`，它会和 §1.1 的全局按下缩放互相牵连 |
| LOW | `FileTable.tsx:118`、`StorageTable.tsx:60`、`SelectionBar.tsx:57`、`Pager.tsx:49/104/135/169`、`PathBar.tsx:81`、`ContextMenu.tsx:55`、`StoragesPage.tsx:186`、`MarkdownViewer.tsx:90` | 全部用 `transition-colors`，但实际只变 `background-color`（部分含 `color`） | 只变背景的用 `transition-[background-color] duration-100 ease-out` | 过宽但可接受；真正的收益是明确写下"会变什么"，避免后来者往里塞新属性 |
| — | `index.css:126-128` | 全局 input 焦点过渡明确写了 `transition-property: border-color, box-shadow, outline` | **保持** | 这是本仓库唯一一处完全符合 `performance.md` 的写法，作为全站范式 |
| — | 全仓 | 没有任何 `will-change` | **保持** | `performance.md` 明确说"看到首帧卡顿再加"，不要预防性地加 |

### 1.7 图标体系（icons.md / icon-transitions.md）

> 这是"好看"上差距最大的一组。当前项目的图标词汇量是：**emoji + 文本符号**。

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `format.ts:19-22` → `FileTable.tsx:146`、`FileGrid.tsx:79` | 文件类型用 emoji：`💾` / `📁` / `📄`，`text-2xl` 与 `text-4xl` | 换成 24 网格、`stroke="currentColor"`、`stroke-width=1.5` 的 SVG（`file` / `folder` / `database`）；选中态只需换 `color` 或切 fill | 违反 `icons.md`「One SVG, recolored per state」：emoji 是**彩色位图式字形**，无法随 hover/selected/disabled 换色，所以在选中行里它无法参与状态表达；也无法与旁边的常规字重文本对齐光学重量 |
| MEDIUM | `FileTable.tsx:78`、`Pager.tsx:121,146`、`PathBar.tsx:83`、`DirectoryTree.tsx:81` | 排序箭头 `↑`/`↓`、分页 `‹`/`›`（其实是排印引号不是箭头）、路径编辑 `✎`（U+270E，**部分平台会渲染成彩色 emoji ✏️**）、目录展开 `▾`/`▸` | 统一为 SVG：箭头、`chevron`、`pencil`。展开态用**同一个 chevron SVG 旋转 90°**（可过渡），不要用两个不同字形 | `icons.md`「One optical strategy per surface」：一行里同时出现彩色 emoji、文本符号和细描边箭头，视觉重量完全失控。`‹`/`›` 还是方向相关字形，RTL 下必须 `[-scale-x-100]` 翻转；且它们是文字，基线对齐与数字不同 |
| LOW | `DirectoryTree.tsx:79-81` | chevron 放在 `w-5` 固定宽里，字形本身不居中 | 用 `flex w-5 items-center justify-center` + SVG | 文本字形在固定盒里既不居中也不在像素格上，16px 下会发虚 |
| LOW | `FileToolbar.tsx:104-115` | 工具栏四个按钮（新建文件夹 / 上传文件夹 / 上传 / 刷新）纯文字 | 加左侧 SVG 图标；有图标的按钮按 `surfaces.md` 把图标侧内边距减 2px（`ps-4 pe-3.5`）而非两侧相等 | 文件管理器里"上传/文件夹/刷新"是有通用图形的动作；纯文字按钮在工具栏里扫读效率低 |
| LOW | `App.tsx:39` vs `LoginPage.tsx:48` | 同一个 "E" 品牌块的圆角不一致：`h-9 w-9 rounded-lg` vs `h-14 w-14 rounded-2xl` | 抽成一个 `LogoMark` 组件，尺寸由 prop 给，圆角按尺寸反算 | 同一标识两种圆角是可见的不一致 |

**决策点**：引入图标依赖（`lucide-react`，描边风格天然匹配"400 字重配 1.5px 描边"），还是在本仓写一个 `components/icons.tsx`（约 10 个手写 24 网格 SVG，零依赖）。建议后者——符合 `AGENTS.md`「保持精简、不引入不必要依赖」的取向，且能让"一套图标"这件事有唯一出口。**两者只能选一个，且全站只用一套。**

### 1.8 入场与退场（enter-exit.md）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `SelectionBar.tsx:35` | `if (selection.count === 0) return null` —— 首次选中文件时底部浮条**硬切出现** | 用 CSS 过渡做入场/退场（不引依赖）：容器常驻并 `hidden`-by-class，`translateY(12px)`+`opacity:0` → `0/1`，入场 300ms `ease-out`，退场 150ms；配套 `FilesPage.tsx:604` 的 `pb-24` 也要一起过渡（否则列表底部高度瞬跳） | 这是"首次选中"这种低频、有层级含义的时刻，正是 `enter-exit.md` 允许做入场的地方；而它现在压着列表硬闪一下 |
| MEDIUM | `FilesPage.tsx:674-678` | 列表错误横幅条件渲染，出现时把下方整块内容顶下去 | 加 150ms 的 `opacity`+`translateY(-4px)` 入场 | 低频事件、且改变了布局高度，突然出现会让人以为点错了。**注意**：错误不适用于 stagger（不是层级序列） |
| LOW | `DropZone.tsx:67-73` | 拖放浮层瞬间出现 / 消失 | `opacity` 150ms 进出，`pointer-events-none` 保持 | 拖放是高频交互，只需最克制的过渡；现在的硬闪在拖拽经过时很明显 |
| LOW | `FilesPage.tsx:682` | 空状态是一个 `p-16` 居中的单句 | 按 `enter-exit.md`「empty state 属于可分块的入场时刻」做 2 段 ~100ms stagger（标题 + 说明 + 动作按钮） | 目前空状态既没有图标也没有下一步动作，纯文字对"下一步该干嘛"零信息 |
| — | `ContextMenu.tsx`、`Modal.tsx` | 右键菜单/弹窗**不加**入场动画 | **保持** | 高频繁交互必须即时反馈，`animations.md` 明确要求 |

### 1.9 主题切换抑制（animations.md · Suppress transitions on theme switch）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `index.css:224-229` | `.theme-transitioning *` 写了"抑制过渡"，但**全仓没有任何地方添加这个类**（`grep theme-transitioning` 只命中 CSS 自身） | 二选一：**(A)** 接一个主题开关，切换时 `document.documentElement.classList.add("theme-transitioning")` → 改 `data-theme` → 读一次 `document.body.offsetHeight` 强制回流 → 双 `requestAnimationFrame` 后移除；**(B)** 删除该规则与暗色 token | 方案 A 的机制本身是对的，缺的只是接线。**但在接线之前，必须按 A 的完整顺序做**——直接加类不强制回流等于没加 |
| MEDIUM | `index.html:2`、`index.css:45-78` | `index.html` 的 `<html>` 上没有 `class`/`data-theme`；`.dark` 与 `[data-theme="dark"]` 两套 token（含 `color-scheme: dark`）**永远不可达** | 同上一项一起决策 | 现在只有浅色一种皮肤。要么把暗色做成可用状态，要么删掉，不要留一份"看着像有、其实进不去"的 token |

### 1.10 控件面一致性（surfaces.md 的横向推论）

> 同一类控件在全仓有 4 种写法，这是"看起来不像一个产品"的主因。

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `DriverField.tsx:11`、`StorageFields.tsx:83`、`StorageJsonDialog.tsx:16`、`LoginPage.tsx:61,72`、`FilesPage.tsx:622,722,738`、`PathBar.tsx:56`、`Pager.tsx:68`、`LocaleSelect.tsx:23`、`BackupPage.tsx:64`、`MetadataPage.tsx:101,114,120,136,149` | 输入框/下拉有 4 套类名：`focus:ring-4 focus:ring-accent/15` 版、`focus:border-focus` + `outline-none` 版、什么都不写靠 `index.css:120-129` 全局规则版、以及 `transition` 宽窄不同的三种写法 | 建一个 `lib/ui.ts` 导出 `INPUT_CLASS` / `CONTROL_CLASS`，全部引用同一常量 | `BackupPage.tsx:64` 与 `MetadataPage.tsx` 的 5 个字段**连焦点样式都没有**（只有全局 outline）；而 `LoginPage` 是 ring。同一个表单控件在三个页面里聚焦表现不同，用户会觉得"哪里怪"却说不出 |
| MEDIUM | `index.css:41` | `--field-radius: 0.75rem`（12px）定义了字段圆角，**没有任何组件消费它**；所有手写输入框都硬编码 `rounded-lg`（8px = `--radius`） | 控件类统一用 `rounded-[var(--field-radius)]`，或把 token 改成与 `rounded-lg` 一致后删掉冗余 | 设计 token 与实现脱节：改 `--field-radius` 不会产生任何效果，等于假 token。同类：`index.css:18` 的 `--field-border: transparent` 也从未被使用，且暗色主题没定义它 |
| LOW | `index.html:7`、`index.html:5` | `<title>Vite + React + TS</title>`，favicon `/vite.svg` | 改成 `EdgeList` 与项目图标 | 浏览器标签页上是脚手架的名字，是最容易露怯的一处 |

### 1.11 加载态与空态（一致性 + 不跳版）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `StorageTable.tsx:111-124` vs `StorageTable.tsx:30-52` | 骨架只有 3 个块（`h-4 w-1/4`、`h-5 w-16`、`ml-auto h-4 w-32`），而真实行有 6 列固定宽 `flex-1 / w-24 / w-16 / w-24 / w-40 / w-56`；**且骨架没有镜像表头** | 照 `FileListSkeleton.tsx:22-35` 的做法：先渲染一个与真表头同列宽的表头骨架，再用相同的 6 个列宽画行 | 真实数据到达时列会整块位移。同仓的 `FileListSkeleton` 做对了（连注释都写了"Mirrors the real header"），两个骨架互相不一致 |
| MEDIUM | `MetadataPage.tsx:68-69` | 加载态是**一行文字** `Loading…`，而 `MetadataPage.tsx:74` 的行结构与 `StorageTable.tsx:57` 几乎一样 | 复用 `StorageTableSkeleton`，或写一个形状匹配的骨架 | `AGENTS.md` 明文要求"loading states 用 HeroUI `Skeleton`"；这是全仓唯一一处违反自己规范的地方 |
| MEDIUM | `FilesPage.tsx:682`（`p-16`）、`StoragesPage.tsx:208/210`（`p-8`）、`MetadataPage.tsx:71`（`p-8`） | 三处空态的间距、结构、文案位置各不相同，都没有图标、都没有动作按钮 | 抽一个 `EmptyState`（图标 + 标题 + 说明 + 可选动作），统一 `p-10` | 空态是用户第一次见到某个页面时看到的东西，现在它是最没有设计的一屏 |
| — | `FileListSkeleton.tsx` 全文 | 表头镜像 ✓、列宽与真实行一致 ✓、`divide-y` 与 `border-b last:border-0` 等价 ✓ | **保持** | 作为其它骨架的模板 |

### 1.12 预览面板尺寸（surfaces / 一致性）

| 严重度 | 位置 | 现状 | 建议 | 原因 / 影响 |
| --- | --- | --- | --- | --- |
| MEDIUM | `ImageViewer.tsx:9`（`max-h-[68vh,640px]` `min-h-[240px]` `p-4`）、`PdfViewer.tsx:20`（`min-h-[360px]`）、`MarkdownViewer.tsx:61`（`p-5`）、`MediaViewer.tsx:20`（`max-h-[64vh,600px]`）、`UnsupportedViewer.tsx:14`（`p-6`）、`MonacoTextEditor.tsx:65`（`min-h-[360px]` `p-0`） | 六种预览器的高度、最小高度、内边距各不相同 | 落一组常量（例如 `PREVIEW_H = h-[min(68vh,640px)]`、`PREVIEW_MIN = min-h-[360px]`、`p-5`），六个预览器全部引用 | 弹窗尺寸会随文件类型跳变：看图片是 240 高、看 PDF 变 360、看视频又变成另一种。同一个弹窗在同一次浏览里"忽大忽小" |
| LOW | `preview/index.tsx:33`、`MarkdownViewer.tsx:37`、`MonacoTextEditor.tsx:65` | 同一串高度类名抄了三遍 | 同上常量 | 三份拷贝，改一处忘两处 |
| MEDIUM | `MonacoTextEditor.tsx:19,65` | `workbench.colorTheme: "Default Dark Modern"` + 容器硬编码 `bg-[#1e1e1e]` | 用 token（如 `var(--surface)` 或按主题给 editor 主题 `vs`/`vs-dark`），并去掉裸 hex | **浅色主题下打开文本文件会弹出一个纯黑编辑器**，是全站唯一一个无视主题的面；等 §1.9 接好暗色后，两套主题下都是黑的 |

### 1.13 光学对齐（surfaces.md · Optical alignment）

未发现需要单独处理的问题（本项无 actionable finding）：

- 表头用 `h-4 w-4` / `w-8` 占位符与数据行对齐 ✓
- 排序箭头预留 `w-3`（`FileTable.tsx:91`），**切换排序时表头不抖动** ✓
- `‹`/`›` 的基线与光学居中问题已并入 §1.7 的 SVG 化一并解决，不单独列项

---

## 2. 分步实施计划

> 每步独立提交。改动只涉及 `src/react-app`，不影响 Worker。每步的验收命令按 `AGENTS.md`：先跑最小相关测试，再跑该步要求的全量命令。

| 步骤 | 内容 | 涉及文件 | 验收 | commit |
| --- | --- | --- | --- | --- |
| **UI-1** | 修按下反馈：过渡提到基础态、限定作用域、高频繁控件关闭缩放、`transform`→`scale`（§1.1） | `index.css` | `pnpm lint`、`pnpm build`；人工逐个按下松手看回弹 | `fix: make press feedback interruptible` |
| **UI-2** | 键盘焦点可见化：行/瓦片加 `focus-visible` 环；瓦片用 `group-focus-within` 露出勾选框（§1.2） | `FileTable.tsx`、`FileGrid.tsx`、`file-views.test.tsx` | `pnpm test`（补一条 `focus-visible` 类名断言）、`pnpm lint`、`pnpm build` | `fix: show keyboard focus on file rows` |
| **UI-3** | 图标体系：新增 `components/icons.tsx`（或落地 `lucide-react` 决策），替换 emoji 与文本符号，展开态改单个 chevron 旋转，工具栏加图标（§1.7） | `components/icons.tsx`（新）、`format.ts`、`FileTable.tsx`、`FileGrid.tsx`、`Pager.tsx`、`PathBar.tsx`、`DirectoryTree.tsx`、`FileToolbar.tsx`、`App.tsx`、`LoginPage.tsx` | `pnpm test`（`file-views` / `preview-views` 中对字形文案的断言需同步）、`pnpm lint`、`pnpm build`；人工在 16px 下检查每个图标 | `feat: replace glyph icons with an svg set` |
| **UI-4** | 面的统一：加 `--shadow-border`/`--shadow-border-hover`，卡片/浮层改用阴影承担边，修同心圆角（§1.3、§1.4） | `index.css`、`FilesPage.tsx`、`ContextMenu.tsx`、`SelectionBar.tsx`、`StorageTable.tsx` | `pnpm lint`、`pnpm build`；人工核对菜单四角与浮条四角 | `feat: unify card and overlay surfaces` |
| **UI-5** | 控件统一：`INPUT_CLASS` 常量、消费 `--field-radius`、清掉裸 `transition`（§1.6、§1.10） | `lib/ui.ts`（新）、`DriverField.tsx`、`StorageFields.tsx`、`StorageJsonDialog.tsx`、`LoginPage.tsx`、`BackupPage.tsx`、`MetadataPage.tsx`、`FilesPage.tsx`、`PathBar.tsx`、`Pager.tsx`、`LocaleSelect.tsx`、`index.css` | `pnpm test`、`pnpm lint`、`pnpm build`；人工逐页 Tab 过一遍表单 | `refactor: share one field control style` |
| **UI-6** | 加载/空态：`StorageTableSkeleton` 对齐列宽并镜像表头，`MetadataPage` 换骨架，抽 `EmptyState`（§1.11） | `StorageTable.tsx`、`MetadataPage.tsx`、`FilesPage.tsx`、`StoragesPage.tsx`、`components/common/EmptyState.tsx`（新） | `pnpm test`、`pnpm lint`、`pnpm build`；人工看数据到达的瞬间是否位移 | `feat: mirror table skeletons and unify empty states` |
| **UI-7** | 预览面：统一高度/内边距常量、图片加 outline、Monaco 跟随主题（§1.5、§1.12） | `components/files/preview/*`、`MonacoTextEditor.tsx` | `pnpm test`（`preview-views.test.tsx`）、`pnpm lint`、`pnpm build`；人工依次预览 5 种类型看弹窗是否稳定 | `fix: stabilise preview panel sizing` |
| **UI-8** | 动效：`SelectionBar` 与错误横幅的进出场（含 `pb-24` 同步）、拖放浮层淡入淡出、空态 stagger（§1.8） | `SelectionBar.tsx`、`FilesPage.tsx`、`DropZone.tsx`、`index.css` | `pnpm lint`、`pnpm build`；浏览器 Animations 面板 10% 速度回放；`prefers-reduced-motion` 下确认无动画且状态仍可见 | `feat: add restrained enter and exit motion` |
| **UI-9** | 主题：决定"接线暗色开关"或"删除暗色 token + `.theme-transitioning`"，按决策落地（§1.9） | `index.css`、`index.html`、新增主题 hook/组件 | 若接线：切换瞬间整页**无**过渡（按 `animations.md` 的四步顺序）；`pnpm lint`、`pnpm build` | `feat: wire a theme switch` 或 `chore: drop unreachable dark theme` |
| **UI-10** | 收尾：抽公共分段控件（消掉 3 份拷贝）、预览高度常量、`lang` 与 locale 同步、`<title>`/favicon、z-index 层级收口到一组 token（§1.2 LOW、§1.12 LOW、§1.10 LOW） | 多处 | `pnpm lint`、`pnpm check` | `chore: finish ui consistency pass` |

**建议顺序**：UI-1 → UI-2 先做（两项 HIGH，且都不改动视觉语言，风险最低）；UI-3 / UI-4 / UI-5 是视觉主线的三步，做完这三步"好看"这件事基本到位；UI-6 ~ UI-10 是收尾。UI-3 与 UI-5 都会大面积触碰 JSX，**不要并行**，避免冲突。

---

## 3. 明确不做（避免"顺手改坏"）

以下写法已经符合 `better-ui`，后续步骤不得回退：

1. `FileTable.tsx:118` / `StorageTable.tsx:60` 的行 hover 用 `transition-colors`（≤150ms 内），符合"高频繁交互用最克制的过渡"。
2. 分段控件与 `Action` 的同心圆角（外 8 + 内 6）——是本次要推广的基准，不是问题。
3. `FileListSkeleton` 的表头镜像与列宽（要推广到 `StorageTableSkeleton`，不要反过来改它）。
4. `index.css:126-128` 明确列出 `transition-property` 的写法。
5. `FileTable.tsx:91` 为排序箭头预留 `w-3`，切换排序不抖动。
6. `DropZone` 的 `depth` 计数 + `pointer-events-none`（避免 `dragleave` 抖动）。
7. 右键菜单与弹窗**不加**入场动画。
8. 全仓不引入 `will-change`。

---

## 4. 范围外（归其它 `better-*` skill，此处仅登记，不在本文件执行）

| 项 | 归属 | 说明 |
| --- | --- | --- |
| 焦点体系、ARIA、`autoFocus` 策略、`prefers-reduced-motion` 兜底 | `better-accessibility` | 本次只做 §1.2 的"焦点可见"最低限度 |
| `disabled:opacity-40` 叠在 `text-muted` 上的对比度；`accent-soft` 上选中文字对比度 | `better-accessibility` | 需实测，`未验证` |
| `index.html:2` 固定 `lang="en"`，而 UI 可切中文；`--font-sans` 无 CJK 字体 | `better-typography` | 影响中文行的字重与行高一致性 |
| 表格数字列未用 `tabular-nums`（`FileTable.tsx:152-157`） | `better-typography` | 日期/大小列对齐 |
| `Toast.Provider placement="bottom end"`（`App.tsx:35`）与底部居中的 `SelectionBar` 在窄视口会重叠 | `better-layout` | 浮层的安全区与断点 |
| `z-10 / z-20 / z-30` 为散落字面量（`App.tsx:36`、`SelectionBar.tsx:39`、`ContextMenu.tsx:31`、`DropZone.tsx:70`），且拖放浮层与浮条同为 `z-20`，靠 DOM 顺序决胜 | `better-layout` | UI-10 顺手收口，未单独成项 |
| 空状态文案、错误文案的可读性 | `better-writing` | — |

---

## 5. 验收缺口（必须补的验证）

1. ~~本机 `node_modules` 未安装，HeroUI 的 `Card` / `Button` 实际样式未能读取~~ → **已解决**，结论见 §6.1。
2. 无浏览器，**所有动效只做了代码级审查，没有在 Animations 面板按 10% 速度回放**。UI-1 已在此前提下提交（按压缩放只动了 `scale` 与过渡归属，风险已降到最低），**UI-8 落地前必须补这一步**。
3. `--accent` 与 `--*-soft` 的对比度未测量（`accent-soft` 上的选中文字、`disabled:opacity-40` 叠在 `text-muted` 上）。UI-5 会把分段控件的选中态切到 `--accent-soft-foreground`，届时一并实测。
4. ~~UI-3 会改变多处测试里对字形/文案的断言~~ → **已解决**，UI-3 已同步 `file-views.test.tsx` 的断言（emoji → `data-icon`）。
5. **环境陷阱（与代码无关，但会让验收命令假失败）**：工作区的删除操作会把文件移入仓库根的 `.Trash-0/`。当它里面装着 `dist/client/assets` 的产物时，`pnpm lint`（即 `eslint .`）会在 Node 默认 2GB 堆上 **OOM 崩溃**（`FATAL ERROR: Ineffective mark-compacts near heap limit`，约 30s 后 abort），而 `eslint src` 却完全正常——因为 `.Trash-0` 不在 `eslint.config.js` 的 `ignores` 里，ESLint 会去读那 7.6MB 的 `TextViewer-*.js`。**遇到这个问题先 `ls -la` 看有没有 `.Trash-0/`，清掉再跑，不要去改 `eslint.config.js` 的 `dist` 忽略项。**

---

## 6. 执行前的研究修正

开始改代码前先把 `node_modules/@heroui/styles/dist` 读了一遍。第 1 节里标 `未验证` 的几条现在有了确切答案，**其中 4 条计划因此被推翻**。

### 6.1 已确认的依赖库事实（替换第 1 节的"未验证"）

| 事实 | 取值 | 出处 |
| --- | --- | --- |
| HeroUI `Button` 的按压缩放 | **本来就有**：默认 `scale(0.97)`，`sm` 为 `0.98`，`lg` 为 `0.96`，`transition: transform 250ms var(--ease-smooth)` | `components/button.css` |
| HeroUI `Card` 的面 | `border-radius: min(32px, var(--radius-3xl))` = **24px**，`box-shadow: var(--shadow-surface)`，**没有 border** | `components/card.css` |
| HeroUI 浮层（popover） | 半径同上 24px，`box-shadow: var(--shadow-overlay)`，无 border；入场 `150ms ease-smooth fade-in zoom-in-90`，退场 `100ms zoom-out-95 fade-out` | `components/popover.css` |
| HeroUI 菜单 | 容器 `p-1 gap-1 overflow-clip`；菜单项 `rounded-2xl`(16px)、`min-h-9`、`px-2 py-1.5`、按下 `scale(0.98)`、hover `bg-default` | `menu.css`、`menu-item.css` |
| 字段圆角 | `--radius-field: var(--field-radius, calc(var(--radius) * 1.5))` = **12px**，来自 HeroUI，不是本仓发明 | `themes/shared/theme.css` |
| 焦点环 | `status-focused` = `ring-2 ring-focus ring-offset-background`；`status-focused-field` = `ring-2 ring-focus`（offset 0） | `utilities/index.css` |
| 字段配方 | `.input` = `rounded-field border bg-field px-3 py-2 text-field-foreground shadow-field outline-none placeholder:text-field-placeholder`，过渡为 `background-color/border-color 150ms ease-smooth, box-shadow 150ms ease-out` | `components/input.css` |
| 可用的字段/浮层 utility | `bg-field` / `bg-field-hover` / `bg-field-focus`、`rounded-field`、`shadow-field` / `shadow-surface` / `shadow-overlay`、`border-field-border(-hover/-focus)`、`text-field-foreground`、`placeholder:text-field-placeholder` | `themes/shared/theme.css` |
| HeroUI 现成组件 | 已有 `input` / `select` / `menu` / `menu-item` / `popover` / `tabs` / `textfield` 的样式与组件 | `components/` |

### 6.2 被修正的计划条目

| 原计划 | 修正后 | 原因 |
| --- | --- | --- |
| §1.1「限定全局按下缩放的作用域 / 关掉高频繁控件的缩放」 | **整条删除** | HeroUI `Button` 自带按尺寸调好的缩放与 250ms 过渡。全局 `button:active:not(:disabled)`（特异度 0,2,1）**压过** `.button:active`（0,2,0），等于把库自己的选择和时间都覆盖掉了。正确做法是改成 opt-in 的 `.tap`，只给 HeroUI 不管的裸 `<button>` 用，并保留 0.96 这个 better-ui 规定的值 |
| §1.4「新增 `--shadow-border` / `--shadow-border-hover` token」 | **改用库自己的 `--surface-shadow` / `--shadow-overlay`** | 库已经有分层的阴影 token，再发明一套等于同一份语言两种说法。`shadow-surface` 就是 HeroUI `Card` 的边 |
| §1.3「菜单按 12 − 8 = 4px 反算菜单项圆角」 | **改成跟随库的配方**：容器 24px + `p-1` + 项 `rounded-2xl`(16px) | 库自己的菜单就是 24 − 4 而项用 16px，并不严格同心。与库一致比我的算术更重要 |
| §1.8「右键菜单不加动画 —— 保持」 | **改为采用库的 popover 动效**：入场 150ms（fade + zoom-in-90）、退场 100ms（zoom-out-95 + fade） | 库的浮层**本来就动**，且入场 150 / 退场 100 正好符合 better-ui「退场要短于入场」。原条目只看了 better-ui 而没看库 |
| §1.10「`--field-radius` 是无人消费的假 token」 | **是 HeroUI 的 token**，本仓只是重复声明了一遍；真正的问题是手写控件用 `rounded-lg` 而不是 `rounded-field` | 见 6.1 |
| §1.10「`--field-border` 从未被使用，且暗色没定义」 | `--field-border` 也是 HeroUI 的 token（默认 `transparent`） | 是重复声明，不是死代码 |
| 新增 | `bg-field-background` **不是主题色名**，`--color-field-background` 不存在 → 该 class 被 Tailwind 静默丢弃。输入框实际背景来自 `index.css` 的全局规则，所以在亮/暗两色下都"碰巧"看不出问题 | 全站 12 处都在用；改名 `bg-field` 或删掉 |
| 新增 | 分段控件选中态用 `text-accent` 压在 `accent-soft` 上，而库专门提供了 `--accent-soft-foreground` 就是给这种场合的；本仓 `App.tsx`、`DirectoryTree`、`StorageTable` 用的是后者，三处分段控件用的是前者 | 同一个语义两种取值，且前者对比度更低 |
| 新增 | §1.4 的"阴影代替边框"**不适用于有意画出的描边控件**：库自己的 `button--outline` 就是 `@apply border border-border` | 所以 `BackupPage.tsx:74` 那个带边框的"选择文件"label **保持不动**。规则针对的是"用边框表达层级"，不是"所有边框"——别把它一路清到按钮上 |

### 6.3 执行记录

| 步骤 | 状态 | 实际改动 |
| --- | --- | --- |
| UI-1 | ✅ | `index.css` 删掉全局按下缩放规则，新增 `@utility tap`（背景/边框/文字/`scale` 过渡 + `:active:not(:disabled):not([aria-disabled])` 时 `scale: .96`）与 `@utility tint`（仅颜色），两者都带 `prefers-reduced-motion` 兜底；12 个组件里的 `transition-colors` 换成 `tap` / `tint`，并把过渡属性写成会变的那几个。构建产物确认 `.tap{transition-property:...}` 与嵌套的 `:active`、`@media` 都正确生成。commit `9c7406b` |
| UI-2 | ✅ | `FileTable.tsx` 行加 `focus-visible:ring-2 focus-visible:ring-inset`（**inset 而非 offset**：卡片裁切 `overflow-hidden`，offset 环会在首/末行丢掉左右边），`FileGrid.tsx` 瓦片加 `focus-visible:ring-2`；勾选框的露出条件从 `focus:`（作用在 checkbox 自身）改成 `group-focus-within:opacity-100 group-focus-within:scale-100`。补 3 条断言。commit `df32801` |
| UI-3 | ✅ | 新增 `components/common/icons.tsx`（13 个手写 24 网格、`stroke="currentColor"`、默认 1.5px 描边的图标，每个带 `data-icon` 供测试断言）；新增 `FileGlyph.tsx` 接管列表字形（挂载点＝`database` + `text-accent`，文件夹/文件共用中性色），`format.ts` 的 emoji `fileGlyph` 删除；排序箭头换成 `ArrowUp/Down`（激活列 `strokeWidth={2}` 配半粗标签）、分页换 chevron（`rtl:-scale-x-100`）、路径编辑换 `pencil`、目录树改成**同一个 chevron 旋转 90°**、工具栏四个动作加图标。测试断言从 emoji 改为 `data-icon`。**偏离原计划**：原计划还列了 `App.tsx`、`LoginPage.tsx` 的品牌块（§1.7 LOW），未做——那是同一个标识两种圆角的独立问题，与图标体系无关，留给 UI-10 的收尾。commit `33106ae` |
| UI-4 | ✅ | `FilesPage.tsx` 的手写卡片换成 `HeroCard variant="default"`（`p-0 gap-0`：行自带内边距；错误横幅必须与列表贴齐）；`DirectoryReadme.tsx` 同样换成 `HeroCard className="p-0"`——它就在列表卡片上下方，改完列表卡片后两者圆角不一致会**比改之前更明显**，所以必须一起改（§1.4 把它漏了）；`ContextMenu.tsx` / `SelectionBar.tsx` 采用库的菜单配方 `rounded-3xl` + `p-1` + `rounded-2xl`（见 §6.2），去掉 `border border-border`，`shadow-lg`→`shadow-overlay`；`StorageTable.tsx` 状态点改 `bg-current`。补 3 条断言（菜单/浮条的面、readme 用 `card--default`）。commit `8955481` |
| UI-5 ~ UI-10 | ⬜ | 未开始 |

**实施中新增的两条经验**（原计划未预见）：

1. **`focus-visible:ring-inset` 不是风格选择**：列表卡片现在由 `HeroCard` 提供 `overflow-hidden`，任何画在行盒子之外的环都会在首/末行被切掉。改用 inset 环是唯一可行方案。
2. **`SelectionBar` 的按钮高度是被 16px 圆角反推出来的**：`px-2.5 py-1.5` + `text-xs` 只有 28px 高，16px 圆角会被浏览器夹到 14px，视觉上变成胶囊——与库配方"16px 是一个角"的意图相反。给到 `min-h-9`（= 库的菜单项高度）后，浮条总高度仍是 44px（内边距从 8px 减到 4px 正好抵消），形状与右键菜单完全一致。

