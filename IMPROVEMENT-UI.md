# UI 改进项 — iCloud 风格重设计

> **上一轮已收口**：UI-1 ~ UI-10（better-ui 审查）全部完成并已逐条记录，执行记录在 git 历史 `df32801`..`03cf392`（`git show HEAD:IMPROVEMENT-UI.md`）。
> 上一轮立下的规则**继续有效**，本轮不重开：`@utility tap` / `tint` / `arrive` / `image-outline`、`z-index` 四档具名层级、主题的"选择 vs 外观"分离与四步切换、一套手写图标、`EmptyState`、`metrics.ts` 的预览几何。
> 本文档是新阶段（iCloud 风格），编号从 **UI-11** 起，不复用旧编号。

---

## 0. 审查结论

### 0.1 一句话

现在的问题不是"不好看"，而是**层级全用在同一个方向上**：每一块内容都被包成一个 24px 圆角、带阴影的浮起卡片——文件列表是卡片、存储表是卡片、元数据规则是卡片、备份表单也是卡片——而页面底色（`oklch(97.02%)`）与卡片底色（`oklch(100%)`）只差 3 个百分点，卡片又不靠边框定义自己（HeroUI 的 `.card` 没有 border，只有 `shadow-surface`，而那个阴影在暗色下是 `inset` 透明的）。

两件事同时发生：**所有东西都浮起来了，所以没有任何东西浮起来；面板和页面几乎同色，所以卡片的边只靠一层 1-2px 的阴影在撑。**

Apple 的做法是反的：**层级靠区域和材质，不靠卡片。** 内容区是平铺的（iCloud Drive 的文件区就是一块平铺的白色区域 + 发丝分隔线，不是一张卡）；只有真正浮在页面之上的东西——右键菜单、弹窗、底部动作条、提示——才有资格用圆角 + 阴影。一条界线把"内容"和"浮层"分开，而不是把所有东西都抬到同一高度。

配套的三个次级原因：

| 症状 | 现状 | Apple |
| --- | --- | --- |
| 圆角语言反了 | 卡片/菜单/浮层 24px，按钮 24px（HeroUI 的 `.button` 就是 `rounded-3xl`，40px 高的按钮配 24px 半径＝药丸），而最小的控件只有 8-12px | 容器**不那么**圆（面板 10-16px、控件 6-8px、菜单项 8-10px），最圆的恰恰是尺寸最小的元素 |
| 边框在替形状说话 | 全仓 21 处 `border-border` / `border-separator`：顶栏下、分段控件外圈、筛选 chip、分页按钮、"选择文件"按钮、拖放浮层、两处提示条 | 发丝线**只**出现在列表行之间，且**从文字列缩进**（不对齐图标、不跨满行）；控件靠填色分界，不靠描边 |
| 动效曲线是"网页"的 | 全仓 `ease-out` + 150ms/300ms | `cubic-bezier(0.32, 0.72, 0, 1)`（快起慢停）+ 200-400ms；**库自己就有这条曲线**（`--ease-out-fluid`，注释原文写着 "Apple style"），本轮只是接上 |

还有一个结构性问题：**文件列表在视口里起步太晚。** `App.tsx` 是「顶栏 64px + 内容区 `p-6`」，`FilesPage` 里标题区、搜索表单、面包屑、工具行四条横带各占一行——列表的第一行出现在约 380px 处。iCloud Drive 把这些收进**一条工具栏**，第一行在 150px 以内。这一条本身就能改变"像网页"还是"像应用"的观感。

### 0.2 目标形态（"像 iCloud"在这里的具体含义）

**导航形态已拍板：保留顶栏，不做侧边栏**（§7）。所以下面这张对照表按"顶栏方案"重写——iCloud 的三层结构只取两层，`iCloud Drive 的解剖` 一列保留原样，是为了让"我们放弃了哪一层"始终可见。

| iCloud Drive 的解剖 | 本项目对应（顶栏方案） |
| --- | --- |
| 顶部工具栏（约 52px）：毛玻璃 + 发丝下边线，左侧标识/标题、右侧页面级动作 | `App.tsx` 的 `<header>`：**保留顶栏**，64 → 52px，毛玻璃接上（80% + 24px 模糊），**去掉下边线**（靠底色差与材质分开，见 R3） |
| 工具栏里的分段控件（macOS 的原生 idiom，不是网页药丸）：浅底容器 + 选中段填充 | 4 个目的地**仍留在顶栏**，但从"四个各自为政的圆角药丸"改成**一个分段控件**——直接复用 `SegmentedControl` 的配方，不再自成一格 |
| ——（这一层我们不要：240px 侧边栏，accent 实心选中行） | **不做**。代价见 §7 第 1 条的取舍记录 |
| 内容区平铺：不自带圆角，靠区域边界和发丝线与工具栏分开 | `FilesPage`/`StoragesPage`/`MetadataPage` 的 `HeroCard` 包裹层**去掉**，换成平铺区域 + 吸顶工具条；页面底是 `bg-background` |
| 列表行 40-44px，**发丝分隔线从文字列缩进**，hover 是浅灰填色，选中是 accent 浅色填充，**没有边框** | `FileTable` / `MetadataPage` 列表 / `StorageTable`：行高 44px、发丝线缩进、去掉双重的 `border-accent` |
| 工具行：面包屑在左（chevron 分隔，末段不可点），视图切换与动作在右 | `PathBar` + `FileToolbar` 合成**一条 44px 工具行**；搜索框进顶栏 |
| 表单是 iOS 式 inset grouped：灰底页面 + 白色圆角分组 + 组内缩进发丝线 | `BackupPage`、`StorageForm`、`MetadataPage` 的新增/编辑弹窗。**`bg-surface` 在本轮的用途就是这层分组卡**，不再是"内容卡" |
| 浮层（菜单/弹窗/底部条）：材质 + 大而软的阴影 + 10-15px 圆角 | 已基本到位（UI-4/UI-8 补），本轮只换曲线、时长与半径档 |
| 大号轻 glyph + 标题 + 一句说明 + 一个蓝色文字按钮 | `EmptyState`：现在是"灰底圆盘 + 一句灰字"，缺标题、缺动作 |

### 0.3 量化差距（全仓计数，`src/react-app/` 下的 `.tsx`）

| 项 | 现在 | 本轮目标 |
| --- | --- | --- |
| 卡片圆角 | `--radius-3xl` = 24px（`.card`、`.popover`、`.menu`、`ContextMenu`、`SelectionBar`、`DirectoryReadme` 骨架） | 15px |
| 按钮圆角 | `.button` = `rounded-3xl` = 24px，高度 36px → 药丸 | 8px |
| 字段圆角 | `--radius-field` = `rounded-field` = 12px | 7.5px |
| 页面标题 | `text-2xl`（24px）+ `text-sm` 灰眉标，只有 3 档字号可用（24/14/12） | 工具栏里 17px semibold；24px 标题只留在登录页 |
| 装饰性边框 | 21 处（16 个文件） | 只保留列表行发丝线 + 有意画出的描边控件 |
| 数字列 | 比例数字（换页、换单位时列宽会跳） | `tabular-nums` |
| 动效曲线 | 全仓 `ease-out`（= `cubic-bezier(0, 0, 0.2, 1)`）+ 150/300ms | `ease-out-fluid` + 200/300/400ms |
| 材质 | 只有顶栏一处 `bg-surface/95 backdrop-blur`（95% 不透明度下模糊几乎看不见） | 工具栏 80% + 24px 模糊 + 180% 饱和；浮层同源 |
| 表面阶梯 | 页面 97.02% ↔ 卡片 100%，差 3 个百分点，卡片无边框 | 窗口 96.4% ↔ 分组 100%，两档 + 浮层，**全部复用库已有 token**（见 R2） |
| 强调色 | `oklch(62.04% 0.195 253.83)`（≈ `#0485f7`） | Apple 系统蓝：亮 `#007AFF` = `oklch(60.28% 0.2177 257.42)`，暗 `#0A84FF` = `oklch(62.43% 0.2056 255.49)`（实测换算，见 R11） |
| 字体栈 | `Inter, ui-sans-serif, system-ui, -apple-system, …`（**Inter 从未被加载**，且 `:root` 与 `--font-sans` 是两个不同的列表） | `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif`（见 R4） |
| 列表起点 | 约 380px | 约 150px |

---

## 1. 设计规则（本轮的唯一真源）

后面所有步骤都从这十一条派生。**新增的样式先问它属于哪一条**，不属于任何一条就不要加——上一轮的教训是"每处看起来都能微调，最后就是四处不一致"。

### R1 几何：一个旋钮降到 Apple 的尺度，外加一条按钮例外

`index.css` 的 `--radius: 0.5rem` 改为 **`0.3125rem`（5px）**。

库的 `@theme inline` 里 `--radius-xs..4xl = calc(var(--radius) × 0.25/0.5/0.75/1/1.5/2/3/4)`，Tailwind 的 `rounded-*` 工具读的正是这一串（上一轮已确认本仓 `rounded-3xl` = 24px）。所以一个值同时落定全仓几何：

| token | 现在 | 改后 | 落点 |
| --- | --- | --- | --- |
| `--radius-md` | 6px | 3.75px | 排序箭头、骨架碎块 |
| `--radius-lg` | 8px | 5px | 分段控件外层 |
| `--radius-xl` | 12px | 7.5px | Switch 轨道 |
| `--radius-2xl` | 16px | 10px | 菜单项、chip |
| `--radius-3xl`（`.card` / `.popover` / `.menu` 用） | 24px | 15px | 面板、弹窗、浮条 |
| `--radius-4xl` | 32px | 20px | （未使用） |
| `--radius-field`（×1.5） | 12px | 7.5px | 所有输入框、下拉 |

**例外只有一个：按钮。** 库的 `.button` 用的是 `rounded-3xl`（24px 放在 36px 高的按钮上＝药丸），降到 15px 之后仍然偏圆，而 Apple 的按钮是 6-8px 的圆角矩形。所以在 `index.css` 里加一条具名 token 与一条覆盖规则（`index.css` 是无层样式，对 Tailwind 的分层输出恒胜，这与现有字段配方的原理相同）：

```css
@theme { --radius-control: 0.5rem; }   /* 8px，控件专用的一档 */
.button { border-radius: var(--radius-control); }
```

`LogoMark` 的 `rounded-[25%]` 是百分比，不受影响，保持不动。

**同心圆角必须逐处复核**，规则写成一句话并附在代码旁：**内层圆角 = 外层圆角 − 内边距**。已知需要重算的配对：`SegmentedControl`（外层 5px − `p-0.5` 2px = 3px，而 `rounded-md` 是 3.75px → 内层改 `rounded-[3px]`，或把 padding 提到 4px 并配 `rounded-md`）、`ContextMenu`（15px − 4px = 11px vs 10px，可接受）、`SelectionBar`（同）、`MetadataListSkeleton` 的按钮骨架（`rounded-3xl` → 需跟 `.button` 一致改成 8px）。

### R2 层级：两档表面 + 材质，**不新增表面 token**

**顶栏方案下没有侧边栏，所以"三档"降到两档**：窗口底（`bg-background`）与分组卡（`bg-surface`）。库的 `--background-secondary` / `--background-tertiary` 仍然存在且是 `color-mix(var(--background), var(--foreground) 4%/8%)` 派生出来的（**改 `--background` 时自动跟随**，不需要另立 token）——本轮只给 `--background-tertiary` 找一个具体用途：**分段控件的容器底色**（顶栏导航与视图切换），替掉现在那圈 `border border-border`。

| 档 | 用途 | 取值 |
| --- | --- | --- |
| `bg-background`（97.02% → **96.4%**） | 窗口底 = 页面底 = 工具栏（叠材质） | 亮 `oklch(96.4% 0.002 253.83)`（≈ `#F5F5F7`，iCloud 的窗口色）。**暗色保持 `oklch(12% 0.0015 253.83)` 不动**（§7 第 4 条已拍板） |
| `bg-surface`（100% / `21.03%`） | **列表页的内容平面**（满宽、无圆角、无阴影，贴着工具行下方开始）＋ **表单分组**（R10 的 inset grouped 卡）。**不再被包在内容卡里**——那正是"到处是卡片"的来源 | 亮保持 100%；暗保持 `oklch(21.03% 0.003 253.83)`（≈ `#1C1C1E`） |
| `bg-background-tertiary`（派生） | 分段控件容器、chip 的填色 | 亮 ≈ `oklch(90.5% …)`、暗 ≈ `oklch(19% …)`，两档都由 `color-mix` 自动得到，不改 |

也就是说：本轮**只把 `--background` 的亮色从 97.02% 降到 96.4%**，暗色一个字不动，其余档位走库的既有 token。改动小、可解释、不会造出第二套表面语言。

**顶栏与内容的分离靠什么**：顶栏是 96.4% 的玻璃压在 100%（暗 21.03%）的内容平面上——静止时是一档底色差，内容滚到它下面时是模糊。所以工具栏既不需要下边线（R3），也不需要自己再抬一层。

**顺带一条暗色实测的发现，它独立支持"去卡片化"**：暗色下 `--overlay` 与 `--surface` 是**同一个值**（都是 `oklch(21.03% 0.003 253.83)`），而三个阴影令牌在暗色下又都是 `inset` 透明的（§6.1）。所以今天在暗色里，**一个弹窗/菜单压在内容卡上时两者同色、无边、无阴影，边界完全不存在**。内容区改成平铺的窗口底（12%）之后，浮层（21.03%）与页面底之间才有 9 个百分点的差，"浮起来"这件事在暗色下第一次真的成立。

材质走一条复用的工具类（与 `tap` / `tint` 同级的写法），而不是每处手写一串 `backdrop-blur`：

```css
@utility material-bar     { backdrop-filter: blur(24px) saturate(180%); }
@utility material-popover { backdrop-filter: blur(32px) saturate(180%); }
```

顶栏用 `bg-background/80` + `material-bar`；浮条与菜单用 `bg-overlay/85` + `material-popover`。**80% 是关键**：现在的 `bg-surface/95` 后面什么都透不出来，模糊等于白写。

### R3 发丝线：只用在列表行之间，且缩进

新增一个 token，照 `--image-outline` 的先例（`:root` 声明 + 暗色块覆盖 + `@utility` 消费）：

```css
@theme { --color-hairline: oklch(0% 0 0 / 0.08); }
.dark, [data-theme="dark"] { --color-hairline: oklch(100% 0 0 / 0.12); }
```

`--color-hairline` 落在 Tailwind 的 `--color-*` 命名空间，于是 `border-hairline` / `divide-hairline` 直接可用，替换现有的 `border-separator` / `divide-separator` 是一对一的。

- **要去掉的（12 处，§0.3 已列）**：顶栏下边线（工具栏与内容靠底色差分开，不靠线）、`SegmentedControl` 的外框（改 `bg-background-tertiary` 填色）、筛选 chip 的边框（改填色）、`Pager` 的"显示更多"按钮边框、`BackupPage` 的"选择文件"边框、`DropZone` 的虚线框（改 `bg-accent-soft` + 2px accent 描边只在拖放瞬间出现）、`TransferDialog` 的两处提示条边框（`bg-warning-soft` / `bg-danger-soft` 自己就够了）。
- **要保留并改造的**：`FileTable` 行、`MetadataPage` 行、`StorageTable` 行。缩进＝从**文字列**左边界开始，不是从区域左边界。实现：行本身不带 border，行与行之间插一条 `margin-left: var(--row-leading)` 的 `divide-hairline` 元素（或在行上用 `border-b` 配 `background-clip` 的技巧）。**不接受**在卡片边缘画满行线——那正是现在"表格感/后台感"的来源。
- **表头去底色**：`FileTable` 的表头现在有 `bg-surface-secondary` 一整条色带，Apple 的表头没有底色，只有 13px 灰色标签 + 排序箭头，底部一条发丝线。`FileListSkeleton` 要同步（它在镜像表头）。

### R4 排版：补一档 17px，砍掉 24px，数字用等宽

**字体栈（§7 第 2 条已拍板）**：把 `-apple-system` 提到最前，`Inter` 退到系统字体之后，并让两处声明一致：

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif;
```

**但收益比"macOS 用户终于拿到 SF Pro"要小，这点必须写清楚**：本仓**从未加载 Inter**（`package.json` 里没有字体包，`index.html` 里没有 webfont 链接），所以今天的栈实际走的是 `Inter`（缺失）→ `ui-sans-serif` → `system-ui`，macOS 上**本来就已经是** SF Pro。这次改动的真实收益是两条：①本机装了 Inter 的人（设计师很常见，一装就把全站接管）从此也会拿到系统字体；②现在 `:root` 的 `font-family`（`Inter, ui-sans-serif, system-ui, -apple-system, …`，`-apple-system` 排在第三，永远轮不到）与 `--font-sans`（`Inter, ui-sans-serif, system-ui, sans-serif`，**没有 `-apple-system`**）是两个不一致的列表，合并成一条。**不引入任何 webfont**（§3）。

现在只有三档可用（24 / 14 / 12），而 iCloud Drive 里**根本没有 24px 的页面标题**——标题在工具栏里，17px semibold。所以在 `@theme` 里补一档并明确用途，不铺整套 iOS 阶梯（铺了就要迁移 30 个文件，收益不抵风险）：

```css
@theme {
  --text-title: 1.0625rem;              /* 17px */
  --text-title--line-height: 1.375rem;  /* 22px */
  --text-title--letter-spacing: -0.01em;
  --text-large-title: 1.75rem;          /* 28px，只给登录页 */
  --text-large-title--line-height: 2.125rem;
  --text-large-title--letter-spacing: -0.022em;
}
```

得到 `text-title` / `text-large-title` 两个工具类。

- **`FilesPage` / `StoragesPage` / `MetadataPage` / `BackupPage` 的 `text-2xl` 页面标题删掉**，标题进工具栏（`text-title font-semibold`）。现在每个页面都有一条"灰眉标 + 24px 标题 + 下方 `mb-5`"的横带，四个页面重复四遍，占掉 88px 高度却只说了"这是哪个页面"——工具栏已经在说同一件事。
- 正文继续用 `text-sm`(14px)、次要信息 `text-xs`(12px)：与 Apple 的 15/13 差 1px，为了 1px 迁移 30 个文件不值得。**这条要写下来**，否则下一轮会有人再问一遍。
- 登录页标题用 `text-large-title font-semibold`。
- 新增 `@utility numeric { font-variant-numeric: tabular-nums; }`，加在：文件大小、修改日期、分页"第 x-y 项，共 z 项"、工具栏的"N 项已选中"、上传进度百分比、存储表的 id。**理由**：这些位置的值会在原地变化，比例数字会让整列左右跳；这是 Apple 从 macOS 到 iOS 都坚持的细节。
- `font-medium`/`font-semibold` 收敛：Apple 的规则是**小字号用 semibold，大字号用 semibold，正文一律 regular**。现在是行名、按钮、标签、chip 全部 `font-medium`，没有层次。规则：行名（`text-sm`）保留 `font-medium`；`text-xs` 的标签与 chip 改 `font-semibold`（小字重一档才读得清）；`text-title` 用 `font-semibold`；其余保持 regular。

### R5 外壳：顶栏 + 内容平面（**不做侧边栏**）

**形态已拍板（§7 第 1 条）：保留顶栏，只改几何与材质。** iCloud 的三层结构只取两层，"像 iCloud"的上限因此从十成降到大约六成——换来的是改动面小一半，且不引入导航的新交互模型（侧边栏在窄屏要么折叠成图标要么做抽屉手势，那都是要重新设计、重新测的东西，见 §3）。下面所有条目都以"没有侧边栏"为前提。

```
┌──────────────────────────────────────────────────────────┐
│ ⬢ EdgeList     [ 文件 │ 存储 │ 元数据 │ 备份 ]   语言 主题 退出 │
├──────────────────────────────────────────────────────────┤  ← 顶栏 52px，毛玻璃
│  根目录 › 设计稿                    [列表|网格]    上传   │  ← 工具行 44px（UI-14 合成）
├──────────────────────────────────────────────────────────┤
│  [glyph] 名称          大小      修改日期                 │  ← 表头 32px，无底色
│  ────────────────────────────────────                     │  ← 发丝线，从文字列缩进
│  [glyph] 名称          12 KB     9月16日                  │
│  ...                                                      │  ← 内容跟随文档流
└──────────────────────────────────────────────────────────┘
```

- **顶栏**：`h-16`(64px) → **`h-13`(52px)**，`sticky top-0 z-header` 不动；底色 `bg-surface/95` → **`bg-background/80` + `material-bar`**（现在 95% 不透明度下模糊几乎看不见）；**去掉 `border-b border-separator/80`**——工具栏与内容靠一档底色差 + 材质分开，这是 R3 要做的第一条。
- **导航**：顶栏里现在是四个各自写一套 `rounded-lg px-3 py-2` 的按钮，与 `SegmentedControl` 是两份必然会漂移的配方。改成**直接复用 `SegmentedControl`**：给它加一个 `size` 档（`sm` ＝ 今天的 `px-2 py-1 text-xs`，`md` 给顶栏：`h-7 px-3 text-[13px]`），容器把 `border border-border` 换成 `bg-background-tertiary` 填色（R3：控件靠填色分界）。于是顶栏导航就是 macOS 工具栏里的分段控件，全仓也只剩**一种**"一组互斥选项"的画法。
- **品牌块**：`LogoMark` + 词标不动，只随 52px 重排。
- **右侧控件**：`LocaleSelect` / `ThemeSelect` / 退出保持不动（本轮不把它们收进溢出菜单，见 §3）。
- **`<sm` 断点**：顶栏折成**两行**——第一行品牌 + 右侧控件，第二行导航分段控件占满宽度、允许横向滚动。这修掉的是今天最硬的一个 bug：`nav` 是 `hidden sm:flex`，**手机上四个目的地整条消失，没有任何替代路径**。
- **内容**：`main` 保持 `min-h-screen bg-background`。`mx-auto max-w-6xl p-6` 这个居中窄列**只留给表单与较窄的页面**（备份、登录）；列表类页面（文件 / 存储 / 元数据）在 UI-14、UI-15 里**脱离这个容器**，改成满宽的 `bg-surface` 平面：无圆角、无阴影、贴着工具行下方开始，行内左缩进 24px 对齐文字列。**这是"去卡片化"真正落地的地方**——如果列表最后还是一张 1152px 宽的白纸飘在灰底上，那只是把卡片换了个名字。路由切换时给内容加 `arrive`（复用现成的一次性动画：淡入 + 2px 上移，200ms）。
- **不做"窗口框架 + 内部滚动"**（`h-dvh` + 内容区 `overflow-auto`）。这是上一版 R5 的主干之一，重算后移出本轮：顶栏本来就是 `sticky`，收益只剩"滚动条住在内容区里"，而代价是 `SelectionBar` 的 `fixed bottom-4`、`DropZone` 的覆盖范围、移动端地址栏收起时的视口抖动——三处回归风险换一个视觉细节，不划算。**移到 §4 单独做。**

### R6 选中态与复选框：一种画法

- 全仓的选中**只剩一种形态**：**浅色填充**（`bg-accent-soft text-accent-soft-foreground` + 图标变 `text-accent`）——列表行、网格瓦片、分段控件的选中段、目录树的当前项，全部用它。上一版计划里还有第二种"侧边栏的实心填充"，随侧边栏一起取消（§7 第 1 条），所以不再需要维护"实心 vs 浅色"的对照表。
- **删掉所有"填充 + 描边"的双重表达**：`FileGrid` 瓦片的 `border-accent bg-accent-soft` 双份（网格里靠 1px 描边表达选中，在 15px 圆角的瓦片上尤其像"没画完"）、`StoragesPage` 筛选 chip 的 `border-accent bg-accent-soft`（改纯填色）。
- **复选框改成按需显形**：表格行现在常驻一个 16px 复选框，是"后台表格"的第二强信号（第一强是表头色带）。改成与 `FileGrid` 瓦片**同一套规则**（它已经写对了：`group-focus-within` 而非 `focus`，因为行才是 Tab 停靠点），默认 `opacity-0 scale-[0.25]`，hover / 选中 / 聚焦时 `opacity-100 scale-100`。工具栏的"全选"保持不变，它保证了这个能力仍然可发现、可键盘触发。

### R7 图标：让"能进的"和"只能开的"一眼分开

- **文件夹改为填色变体**：iCloud Drive 的蓝色实心文件夹是整个界面最强的识别信号。`icons.tsx` 里 `FolderIcon` 增加 `filled` 变体（`fill="currentColor"` + 去掉描边），`FileGlyph` 对 `folder` 用它并给 `text-accent`。于是三种条目的语义靠**形状**而非深浅区分：实心蓝＝可以进去，描边中性＝存储挂载点（保留现有 `DatabaseIcon` + accent），描边中性＝文件。
  - **注意**：这会改掉"挂载点用 accent 色"这条现有约定的负载——颜色不再是唯一区分。要么挂载点改成 `text-warning`（它是"只能操作、不能重命名"的第三种东西），要么保留 accent 但让文件夹的实心形状自己说话。**倾向后者**（不引入第四种颜色），执行时按真机观感定，写进 §5。
- 尺寸：列表 20px（现在 24px 塞在 `w-8` 里，视觉偏大且列宽浪费）、网格瓦片 32px、侧边栏 16px、工具栏 16px。
- 描边：SF Symbols 相对更重，`strokeWidth` 默认 1.5 → **16px 图标 1.5 / 20-24px 图标 1.75**。这是光学重量，必须真机确认（§5）。
- **不引入任何图标库**（见 §3）。现有 13 个手写图标只做尺寸与描边校准，不重画。

### R8 动效：接上库自带的 Apple 曲线

`--ease-out-fluid: cubic-bezier(0.32, 0.72, 0, 1)` 是库自己的 token，注释原文写着 "Custom smooth-out curve: fast start, smooth stop - Apple style"。本轮只是接上它：

- `@utility tap` / `tint` / 各处的 `ease-out` 改 `ease-out-fluid`（`index.css` 里改一处，组件里的 `ease-out` 类逐个替换）。
- 时长：控件 150ms → **200ms**；进来的浮层/面板 300ms → **300ms**（不动）；菜单入场 150ms → **200ms**，退场 100ms 保持（退场只是确认用户自己的动作，这条上一轮已经论证过，不改）。
- `:active` 缩放保持（Apple 的按钮按下是变暗 + 轻微缩放，`.tap` 的 0.96 正好）。
- **所有新增动效必须带 `prefers-reduced-motion` 兜底**，尤其是 R5 的内容平面入场与侧边栏展开。

### R9 空态：Apple 的写法

`EmptyState` 现在是「灰底圆盘 + 一句灰字」，缺两样：标题、动作。上一轮 UI-8 明确把"动作按钮"挂起（"需要逐页决定下一步该干嘛，属功能决策而非动效"）——本轮一并做掉，因为**没有动作的空态在 Apple 的语言里是不完整的**。

结构：48px glyph（`text-muted/60`，**去掉灰色圆盘**——圆盘是本项目自己发明的，Apple 从不用）+ `text-title font-semibold` 标题 + `text-subhead` 说明 + 一个蓝色文字按钮。三处各自的动作：

| 页面 | 标题 / 说明 | 动作 |
| --- | --- | --- |
| 文件列表（空目录） | "这个文件夹是空的" / 拖到这里上传，或 | 上传文件 |
| 文件列表（搜索无果） | "没有匹配的项" / 换个关键词，或回到 | 清除搜索 |
| 存储 | "还没有挂载存储" / 至少需要一个存储才能浏览文件 | 添加存储 |
| 存储（筛选后为空） | "没有这一类的存储" / | 清除筛选 |
| 元数据 | "还没有元数据规则" / 规则可以给目录加说明、隐藏文件和只读保护 | 添加规则 |

要新增 i18n key（标题 / 说明 / 动作 × 5 个场景，双语），并同步 `i18n.test.ts` 的 parity 断言。

### R10 表单：inset grouped

`BackupPage`、`StorageForm`、`MetadataPage` 的弹窗、登录页——这些是"表单"而不是"内容"，用 Apple 在设置面板里的做法：灰底页面 + 白色圆角分组（15px）+ 组内行用缩进发丝线分开 + 行内左边标签右边控件。

- `BackupPage` 现在是一张 `max-w-xl` 的卡片里塞"说明 + 密码 + 开关 + 两个按钮"，分组后是：说明一段、分组一（密码 + 覆盖开关）、按钮行。
- `MetadataPage` 的弹窗现在 9 个控件一路平铺、只有 `space-y-3`，没有分组。分成三组：**路径**（路径 + 允许写入）、**隐藏**（hide + h_sub）、**说明**（header + header_sub + readme + r_sub）。这是本轮唯一一处"信息架构"改动，也是弹窗第一次读起来像设置面板。
- 字段标签从 14px 黑色 `font-medium`（太抢）改 13px `text-muted`；输入框文字 15px；标签在输入框上方左对齐（`LoginPage` 已经这样，其余同步）。
- `LoginPage`：背景从纯色改**极轻的顶向径向渐变**（`radial-gradient(120% 80% at 50% 0%, #fff, var(--background))`，这是 Apple 登录页的做法，注意暗色要另配一组）、卡片 `max-w-md` → `max-w-sm`（现在偏宽）、圆角随 R1、阴影换 `shadow-overlay`。

### R11 强调色：Apple 系统蓝

**§7 第 3 条已拍板。** `--accent` 现在是 `oklch(62.04% 0.195 253.83)`（= `#0485f7`），与系统蓝本来就只差一点。改成实测算过的两个值（换算脚本：sRGB → 线性 → Oklab）：

| 主题 | 取值 | 说明 |
| --- | --- | --- |
| 亮 | `#007AFF` = `oklch(60.28% 0.2177 257.42)` | Apple 亮色的 systemBlue |
| 暗 | `#0A84FF` = `oklch(62.43% 0.2056 255.49)` | Apple 暗色的 systemBlue——暗底上要更亮才同观感，这是 Apple 自己的规则，不是笔误 |

- **只改 `--accent` 一处**。`--accent-soft` / `--accent-soft-foreground` / `--accent-soft-hover` / `--accent-hover` 都是库用 `color-mix` 从 `--accent` 派生的，会自动跟随，所以全仓的浅色选中态会一起变成系统蓝的色调。
- **顺手删掉重复的 `--focus`**：库里已经有 `--focus: var(--accent)`（亮暗各一条），本项目在 `index.css` 里抄了两遍字面量。删掉之后聚焦环自动跟随 accent，且少一处会漂移的重复——与上一轮删 `--field-radius` / `--field-border` 是同一条理由。
- **一处已知的取舍**：白字落在 `#007AFF` 上是 **4.02:1**（当前的 `#0485f7` 是 3.68:1，其实是变好了），仍低于 §5 给正文定的 4.5:1。Apple 的主按钮用的正是这个组合，所以按"忠于系统蓝"取舍，**记为已知偏离**，并在 §5 留退路（若某天必须过 AA：只把主按钮的填充降到约 `oklch(55% 0.22 257)`，不动 `--accent` 本身）。

---

## 2. 分步实施计划

每步一个本地 commit，可独立回滚，消息用 `feat(ui):` / `refactor(ui):` / `fix(ui):`。**顺序不可调换**：UI-11 定标尺，UI-12 把标尺落到全仓，后面才有基准可对比。

| 步 | 内容 | 主要文件 | 完成判据 |
| --- | --- | --- | --- |
| **UI-11** | 令牌层（**只改取值，不改任何 class**，所以这一步测试不可能变红）：`--radius` 0.5rem → 5px；`--radius-control` + `.button` 覆盖；`--background` 亮 96.4%（暗色不动）；`--accent` 换系统蓝 + 删掉重复的 `--focus`；`--color-hairline` 双主题；`material-bar` / `material-popover` / `numeric`；`text-title` / `text-large-title`；字体栈统一；`ease-out-fluid` 接入 `tap` / `tint` / `arrive` / 字段配方 | `index.css` | 产物 grep：`--color-hairline` 两条、两个 `@utility`、两个 `--text-*`、新的 `--accent`、`.button{border-radius:var(--radius-control)}` 全部生成；`.button` 的 computed style 实测 8px（§5.8）；亮/暗各截一张全站图 |
| **UI-12** | 同心几何逐处复核 + 迁移 4 个测试文件里断言实现细节的用例 | 30+ 处 class、`ContextMenu.test.tsx`、`file-views.test.tsx`、`brand-views.test.tsx`、`preview-views.test.tsx` | 测试全绿；全仓除 `metrics.ts` 与断言外无几何字面量；`SegmentedControl` 同心配对断言换成新值 |
| **UI-13** | 外壳：顶栏 52px + 材质 + 去下边线；导航改成复用的分段控件；`<sm` 折两行；内容列 `arrive`（**不做侧边栏、不做内部滚动**） | `App.tsx`、`components/common/SegmentedControl.tsx`（加 `size` 档） | 4 条路由在 1440 与 **390** 两个宽度下都可达——今天 390 下导航整条消失，这是本步的硬判据；Tab 顺序 ＝ 品牌 → 导航 → 右侧控件 → 内容；导航与视图切换确实共用同一个组件 |
| **UI-14** | 文件页：面包屑 + 工具行合成一条；搜索进工具栏；表头去底色；行高 44px；发丝线缩进；复选框按需显形 | `FilesPage.tsx`、`PathBar.tsx`、`FileToolbar.tsx`、`FileTable.tsx`、`FileGrid.tsx`、`FileListSkeleton.tsx` | 列表首行 y 坐标从约 380px 降到 150px 以内（量出来，写在提交信息里）；空/错/加载三态都不跳版；发丝线与文字列左边界对齐 |
| **UI-15** | 去装饰性边框：列表/表卡去 `HeroCard` 包裹改平铺；12 处边框改填色；浮层材质接上 | `FilesPage.tsx`、`StoragesPage.tsx`、`MetadataPage.tsx`、`BackupPage.tsx`、`SegmentedControl.tsx`、`Pager.tsx`、`DropZone.tsx`、`TransferDialog.tsx`、`StorageJsonDialog.tsx`、`StorageForm.tsx`、`FileGrid.tsx`、`ContextMenu.tsx`、`SelectionBar.tsx` | 全仓 `border-border` 归零（除 §3 允许的描边控件）；亮暗两套下浮层都读得清；`shadow-surface` 的使用处全部收敛到浮层 |
| **UI-16** | 图标：填色文件夹变体、尺寸与描边校准、`FileGlyph` 应用、`LogoMark` 复查 | `icons.tsx`、`FileGlyph.tsx`、`FileTable.tsx`、`FileGrid.tsx`、`LoginPage.tsx` | `data-icon` 断言不变（测试不用改）；挂载点/文件夹/文件三种在缩略尺寸下可区分（真机看） |
| **UI-17** | 空态与骨架：Apple 式空态（glyph + 标题 + 说明 + 动作）、补 5 组 i18n key、骨架屏跟随新行高与表头 | `EmptyState.tsx`、3 个页面、`lib/i18n.ts`、`FileListSkeleton.tsx`、`StorageTable.tsx` | 5 个场景都有动作且能执行；i18n 双语 parity 测试通过；骨架与真实行高一致（数行高，不目测） |
| **UI-18** | 表单分组（R10）+ 收尾：`IMPROVEMENT-UI.md` §6.4 执行记录 | `BackupPage.tsx`、`StorageForm.tsx`、`StorageFields.tsx`、`MetadataPage.tsx`、本文档 | 全量 `prettier --check src` → `eslint .` → `tsc -b` → `vitest run` → `vite build` 全过；`vite build` 产物里确认新 token 与 `@utility` 都生成 |
| **UI-19** | 登录页：**用户要求提前，插在 UI-13 之前执行**。去掉卡片改窄列 + 顶向渐变；14px 黑标签改 13px muted；标题接 `--text-large-title`；错误条补 `arrive` | `LoginPage.tsx`、`index.css`（新增 `--text-label`、`--page-glow` + `@utility page-glow`） | 产物 grep：`--text-label` / `.text-label` / `--page-glow` 亮暗两条 / `.page-glow` 全部生成；**标记里不再出现 `card`**、`max-w-sm` 就位；亮暗两套可看（§5.9 的无浏览器预览） |

> **UI-19 是计划外插入的一步**（原本并进 UI-18 的"登录页 + 收尾"）。编号往后加而不改写 UI-11~UI-18，是为了让已完成的记录和已写下的编号都不动。执行中的四条记录见 §6.6。

---

## 3. 明确不做（避免"顺手改坏"）

1. **不引入任何新依赖**。不装 shadcn/Radix、任何图标库、Framer Motion、CSS-in-JS、字体包。HeroUI 仍是唯一组件层，`icons.tsx` 仍是唯一图标来源。
2. **不碰 Worker**。不改任何 API、路由、鉴权、路径归一化、存储适配器、备份/恢复逻辑。本轮是纯前端 + `index.css`。
3. **不改主题机制**。UI-9 的 `ThemeChoice`/`Theme` 分离、`initTheme` 在 `createRoot` 之前、`index.html` 的首帧脚本、`theme-transitioning` 四步顺序，**一行都不动**——只改 token 的取值。暗色窗口保持 `oklch(12%)`（§7 第 4 条已拍板），所以首帧闪白的严重程度与本轮之前完全一样：§5.4 照旧要测，但它不再是"必须解决"的问题。
4. **不做真正的 macOS 窗口行为**：不做窗口拖拽/多窗口/透明标题栏/全屏 API/Spotlight。
5. **不做侧边栏**（§7 第 1 条已拍板）。导航留在顶栏，所以连带不做：抽屉滑出、边缘拖拽、图标栏折叠、可折叠的导航分组。
6. **不铺整套 iOS 字号阶梯**。只补 17px 与 28px 两档（R4 已给理由）；14/12px 继续用 `text-sm`/`text-xs`。
7. **不改右键菜单与弹窗的入场/退场时序**（UI-8 补已定：`setTimeout` 卸载、`fill-mode-forwards`、Escape 同路径）。只换曲线与时长。
8. **不做强调色选择器**、不做自定义主题色、不做"紧凑/宽松密度"开关。暗色之外的配色不做。
9. **不重画图标**，只做尺寸与描边校准。不把 `InboxIcon` 换成"文件夹"——空态的隐喻保持。
10. **不动 `metrics.ts` 的预览几何**（UI-7 已收口），只让预览弹窗的圆角随 R1 变化。
11. **不做虚拟滚动**。列表仍是分页/加载更多，本轮不引入性能机制。
12. **不做文案改写**（除了 R9 新增的空态标题/说明与动作）。现有 i18n 值不动，避免把"重设计"变成"重写"。
13. **不做"窗口框架 + 内部滚动"**（`h-dvh` + 内容区 `overflow-auto`）。理由与三处回归风险写在 R5 最后一条，**移到 §4 单独做**。
14. **不改顶栏右侧那三个控件**（语言 / 主题 / 退出）。不收进溢出菜单、不改成图标——本轮不新增图标语义（R7 只做尺寸与描边校准）。

---

## 4. 范围外（归其它工作，此处仅登记）

- 文件列表的列自定义/列排序偏好持久化。
- 拖拽移动（拖文件到另一个存储/目录）——UI 上是自然的下一步，但需要 Worker 侧确认跨存储语义。
- 文件缩略图（图片列表里显示真实缩略图）——现在网格视图也只有字形，这是"丑"的一个真实来源，但它需要新接口（缩略图/签名 URL），属功能而非样式。
- 键盘优先的导航（方向键在行间移动、`⌘A` 全选）——Apple 用户会期待，但属交互模型。
- **"窗口框架 + 内部滚动"**（`h-dvh` + 内容区 `overflow-auto`，R5 最后一条里移出来的）。回归面覆盖 `SelectionBar`、`DropZone`、移动端地址栏，值得单独一步做，值得单独验收。
- **侧边栏那层结构本身**。本轮拍板不做（§7 第 1 条）；若以后想要真正的三层结构，它是一次独立的、需要重做导航交互模型的改动，不是"加个组件"。
- 顶栏的"最近使用/收藏"入口——需要新数据。

---

## 5. 验收缺口（必须补的验证）

1. **同心圆角逐处复核**。全仓 30+ 处圆角一起变小，配错的地方会"看起来只是有点怪"，不会报错。**规则在 UI-12 被改写两次，最终版**（第一版"内层 = 外层 − 内边距"是等式，第二版我写成不等式并声称"偏大会切进外圈的弧"——**后者是错的，见 §6.5 第 12 条**；用参数方程算过：两个方向都不会穿透，内层的弧恒在外层弧内）：

   > **目标：内层 = 外层 − 内边距。两个方向的偏离不对称：**
   > - **偏深（比等式大）一律不允许**——它是"想同心却没做到"的近似失误，而**近似失误读起来像没对齐，明显的差异才读得像有意内缩**；再深下去会被 CSS 夹成胶囊（库的老 `.button` 就是 15px 配 36px 高）。
   > - **偏浅（比等式小）是惯例方向，1px 以内可接受**——库自己的菜单行就比自己的面板浅 1px。超过 1px 就不叫"略方一点"，叫另一种形状，那时注释必须说明。

   按这条逐处过：面板卡↔行、分段控件↔选中段（**顶栏导航也走这一个，UI-13 新增**）、菜单↔菜单项、浮条↔动作按钮、`Modal`↔`Body`、字段↔内嵌小元素。**UI-12 走完的结果**：**没有一处是肉眼可见的错**；唯一偏离等式的是 `SegmentedControl`（5 − 2 = 3，而 `rounded-md` 是 3.75px，偏深 0.75px，属"不允许但看不出"的那一档），已改成 `rounded-[3px]`；菜单/浮条那对（15 / 4 / 10）是偏浅 1px，**保留**（与库的 `.menu-item` 一致）。**每处配对在代码旁留一行注释说明为什么是这个数**——UI-12 已给 `SegmentedControl`、`ContextMenu`、`SelectionBar`、`metrics.ts`、`StorageTable` 都补上了，并把 `--radius-control` 的三条"不适用"情形写在 `index.css` 的 token 注释里（见 §6.5 第 15 条）。算术本身有自动化守卫，见 §5.10。
2. **测试里的实现细节断言**。计划原本列了 4 个文件、断定它们"几何一变就红"。**UI-12 实测：一个都没红，629 个测试全过。** 原因是这些断言钉的是**类名**（`rounded-3xl` / `rounded-2xl` / `rounded-lg` / `rounded-md`），而类名一个都没改——变的是它们解析出的像素值，渲染测试看不见那一层。所以这一步没有"迁移以恢复绿灯"这回事，§5.2 原来的前提是错的；真正做掉的三件事：
   - **`brand-views.test.tsx` 的同心断言换值**（计划要求的唯一一处）：`rounded-md` → `rounded-[3px]`，并补 `not.toContain("rounded-md")`。
   - **顺手修掉一个假阳性**：那条断言里的 `toContain("p-0.5")` 一直是被同一个 class 串里的 `gap-0.5` 命中的（`ga` + `p-0.5`），所以**即使 inset 消失它也会通过**。换成 `toMatch(/\bp-0\.5\b/)`。
   - **数值只写在注释里，没有搬进测试**：静态渲染测试看不到 px，硬要在测试里复算就得把 token 值抄一份进去，那是把"唯一真源"复制成两份。真正需要自动化的是**算术**，见 §5.10。
   其余三个文件的断言（`role="menu"`、`disabled`、`animate-in`、`shadow-overlay`、无 `border-border`）本来就是语义或规则，**不动**——按"实现细节"迁移动它们只会削弱覆盖。
3. **对比度实测**。亮暗两套都要过：正文 ≥ 4.5:1；`--hairline` 按"非文本对比度"算 ≥ 3:1（发丝线不能低到看不见）；`accent-soft` 上的 `accent-soft-foreground` ≥ 4.5:1。本轮有三处是新量：
   - **系统蓝上的白字 = 4.02:1**（已知偏离，见 R11），写进文档，不改 Apple 的取值；
   - **暗色的新层级**：窗口底 `12%` ↔ 浮层 `21.03%`，量出来确认"浮层压在内容上"在暗色下第一次真的有边界（正向验证 §6.3 第 7 条那个发现）；
   - **分段控件的容器填充**（`--background-tertiary`，亮色 ≈ 90.5%）与选中段的 `accent-soft` 之间要分得开，否则导航选中态在亮色下会糊成一片。
4. **首帧不闪**。`index.html` 的首帧脚本设 `data-theme`，但窗口底色是 CSS 给的。暗色窗口保持 12%（§7 第 4 条），严重程度与本轮之前相同——**但亮色的 `--background` 值变了，照旧要测**：清空 localStorage 冷启动（系统亮/暗各一次）、切主题后再刷新。
5. **`prefers-reduced-motion` 兜底**。新增的内容列 `arrive` 入场必须能禁用（`@utility arrive` 里已有 `animation: none` 兜底，确认它没被绕开）；菜单的 `setTimeout` 卸载不能被曲线/时长改动破坏（上一轮的坑：加了 `motion-reduce:animate-none` 就没有 `animationend`，所以卸载不能改回监听动画事件）。
6. **视口回归**：1440×900、1280×800、1024×768（`sm` 与 `lg` 两个断点各自两侧）、**390×844（硬判据：四个目的地必须可达——今天在这一档整条消失）**。重点看：52px 顶栏折成两行后内容首行的位置、`SelectionBar` 的 `fixed bottom-4` 在文档流滚动下是否仍不遮住最后一行、`FilesPage` 的 `pb-24` 过渡是否仍需要（它当初就是为 `SelectionBar` 留的）。
7. **产物校验**（本仓既有规矩）：`vite build` 后在 `dist/client/assets/index-<hash>.css` 里 grep 新增 token 与 `@utility`。任意值会被转义（`h-\[min\(68vh\,640px\)\]`），不要用朴素字符串搜；`@theme` 变量只在被引用时才输出。
8. **`.button` 覆盖生效**。**UI-12 把"理论上"换成了"量出来"**，不用浏览器就能做掉一半：产物 CSS 的层结构是 `theme`(2497-28896) → `base`(28908-33006) → `components`(33024-400121) → `utilities`(**400138-454785，此后已闭合**)，而项目自己的规则在 454785 之后、**无层**。库的 `.button{border-radius:calc(var(--radius) * 3)}` 在 69426，位于 `@layer components` 内。无层恒胜于同源分层输出，**且中间没有任何一层可供它输**——这条现在是实测，不是推断（同一区域的 `:where(input…)` 字段配方也从 UI-10 起就在真实页面上生效，是同一个机制的旁证）。
   **仍然欠着的一半**：computed style 是 8px 而不是 15px 的**像素读数**要浏览器（DevTools 或 `getComputedStyle`）。层叠问题已解决，这一步现在只剩机械确认；没有浏览器之前不要把它写成"已验证"。
9. **亮/暗双套截图**。每步完成后各截一组全站图（文件列表/网格、存储、元数据、备份、登录、预览弹窗、右键菜单、浮条、空态、加载态）。**这套截图本身就是验收物**，附在对应 commit 的说明里；没有它，"改好了"只是感觉。
   **UI-19 补上了这套东西的无浏览器替代品**（本机没有浏览器，见 §5.8）：把页面组件用 `renderToStaticMarkup` 渲染成静态标记，再把生产构建的样式表**整个内联**进一个 HTML，同一个标记在 `data-theme="light"` 与 `data-theme="dark"` 两个容器里各放一份，交给预览面板打开。因为样式表是产物的、标记是组件的，这个预览**不可能显示应用渲染不出来的东西**——已核对内联的那份 CSS 与构建产物逐字节相同。代价与边界：它只有**静态**画布，交互态（hover / focus / `isPending` / 菜单展开 / 错误条）都不在里面；`useLocale` 在服务端渲染时走 `getServerSnapshot`，所以语言得在生成器里 mock `DEFAULT_LOCALE`，否则出来是英文。生成器是临时的、用完即删，**方法记在这里而不是留在仓库里**（它会写文件，且每个页面都要单独解决上下文依赖，不适合当常驻测试）。
10. **同心算术的守卫（UI-12 新增，计划里没有）**。`src/react-app/geometry.test.ts`：从 `index.css` 读 `--radius`，按阶梯算出每对配角的像素，然后断言**两条**——① `内层 ≤ 外层 − 内边距`（偏深一律不允许）；② `(外层 − 内边距) − 内层 ≤ 1px`（偏浅的惯例容差，取自库自己菜单行的 1px）。**为什么值得加**：§5.1 担心的正是"配错了不会报错"，而 §5.2 的四个测试文件**一个都没红**——类名是稳定的，px 才是会坏的，静态渲染测试永远看不见这一层。当前 3 对：分段控件、右键菜单、浮条。
    **它的边界写在文件头里，别过度信任**：它只覆盖列进去的配对，且当某个组件的 inset 或内层角改动时**这张表要跟着改**——它守的是算术，不是"组件里写的类和表里一致"（那是渲染测试的事）。**两个方向都验证过会红**：把分段控件改回 3.75px → `inner 3.75px against 3px of room`；把菜单行改成 `lg` → `inner 5px leaves 6px of the corner band unused`。**这也说明为什么第二条断言是必要的**：只写第一条的话，"菜单行用 5px" 这种明显漂移会静默通过。

---

## 6. 执行前的研究修正

上一轮的规矩：动手前先读库，把"我以为"换成"我确认"，并明确标出被修正的条目。以下是本轮读 `node_modules/@heroui/styles/dist` 的结果。

### 6.1 已确认的依赖库事实

| 事实 | 出处 |
| --- | --- |
| `--radius-xs..4xl = calc(var(--radius) × 0.25/0.5/0.75/1/1.5/2/3/4)`，写在 `@theme inline` 里，所以 Tailwind 的 `rounded-*` 读的就是这一串 | `themes/shared/theme.css:104-111` |
| `.card { border-radius: min(32px, var(--radius-3xl)); box-shadow: shadow-surface }`，**无 border** | `components/card.css` |
| **`.button` 用的是 `rounded-3xl`（不是 `rounded-field`）**，高度 `h-10 md:h-9` → 36px 高的按钮配 24px 半径＝药丸。这是"不像 Apple"的主要单项，且**一个旋钮解决不了**（同一旋钮还要供卡片） | `components/button.css` |
| `.input { rounded-field … }`、`.checkbox { rounded-md size-4 }`、`.chip { rounded-2xl }`、`.modal` 对话框 `rounded-3xl`、`.skeleton { rounded-sm }` | `components/{input,checkbox,chip,modal,skeleton}.css` |
| `--ease-out-fluid: cubic-bezier(0.32, 0.72, 0, 1)`，库注释原文 "Custom smooth-out curve: fast start, smooth stop - **Apple style**" | `themes/shared/theme.css:132` |
| `--shadow-surface` / `--overlay-shadow` / `--field-shadow` 在暗色下都是 `inset` 透明的（`--surface-shadow: 0 0 0 0 transparent inset`） | `themes/default/variables.css:158-168 / 234-236` |
| **库已提供三档表面**：`--background-secondary`、`--background-tertiary`，且两者是 `color-mix(in oklab, var(--background) 96%/92%, var(--foreground) 4%/8%)` → **本项目改 `--background` 时它们自动跟随**，不需要新 token | `themes/default/variables.css:104-105 / 241-242` |
| `--accent-soft: color-mix(accent 15%, transparent)`、`--accent-soft-foreground: color-mix(accent 70%, foreground 30%)`（亮） / `12%` + `80%/30%`（暗） | `themes/default/variables.css:135-137 / 272-274` |
| 项目 `index.css` 位于 `tailwindcss` 与 `@heroui/styles` 之后，且**不使用 `@layer`**——无层样式对 Tailwind 的分层输出恒胜，这是现有字段配方与 `.button` 覆盖都能生效的原理 | `index.css:1-2`、既有字段配方注释 |

### 6.2 首次修正（读库之后）

1. **R2 从"新造三档表面色"改为"复用库已有的三档"**。初稿打算新增 `--surface-window` / `--surface-panel` / `--surface-raised` 三个 token，读库后发现 `--background-secondary` / `--background-tertiary` 已经存在且是 `color-mix` 派生的（会自动跟随 `--background`）。新造一套会和库的语义并存，是上一轮刚删掉的 `--field-radius` / `--field-border` 同类问题。**结果：本轮表面改动只有 `--background` 两个值。**
2. **R2 的"三档"实际只需要两档新信息**。初稿写"内容面板要抬升"，读 iCloud Drive 的真实结构后修正：**内容区是平铺的，不是抬起的卡**（只有工具栏和侧边栏是独立的材质）。所以"抬升"这套视觉只留给浮层，内容区去卡片化才是本轮的主线。
3. **R1 增加"按钮例外"**。初稿以为降 `--radius` 就能整体落到 Apple 尺度，读 `button.css` 后确认按钮走的是 `rounded-3xl`。若只降旋钮，按钮会是 15px（在 36px 高的按钮上仍偏圆）；若要按钮到 8px 则卡片只剩 4px。**同一个旋钮供不了两个尺度，所以加一条具名 token + 一条覆盖规则**，而不是引入第二套半径阶梯。
4. **R4 从"铺整套 iOS 字号阶梯"缩到"补两档"**。初稿列了 6 档并要迁移 30 个文件；重新权衡后只补 17px / 28px 两档＋等宽数字＋字距，14/12px 继续用 `text-sm`/`text-xs`（差 1px，收益不抵全仓迁移的风险）。旧值与原值写进 R4，避免下一轮重复讨论。
5. **R7 的挂载点配色标记为待定**。文件夹改实心蓝之后，"accent 色＝挂载点"这条现有约定的负载被抽掉了。倾向保留挂载点的 accent 色、让形状自己说话（不引入第四种颜色），但这是观感判断，执行时定，列入 §5。

### 6.3 第二次修正（§7 拍板之后的连带重算）

用户拍板四项（§7），其中两条**没有**按建议走，连带改动面必须重算，不能假装差别只是"少个侧边栏"：

6. **R5 从"顶栏 + 侧边栏 + 内容平面"重算为"顶栏 + 内容平面"**（第 1 条没按建议）。连带重写的章节：§0.2 的整张对照表、§0.3 的两行、R2（三档表面 → 两档）、R6（删掉"侧边栏实心选中"这一种形态）、R11 的位置、§2 的 UI-13、§3 的第 5 条、§4、§5 的第 1/5/6 条。**没有跟着变的**：R1 几何、R3 发丝线、R4 排版、R7 图标、R8 动效、R9 空态、R10 表单——这些与导航形态无关，所以文档里的取舍论证继续有效。
7. **暗色窗口保持 `oklch(12%)`**（第 4 条没按建议）。真黑那版会带来两个连带项（首帧闪白加剧、"侧边栏 vs 真黑"的对比度要重测），现在都不存在了。**但这顺带暴露了一个更值钱的事实**：暗色下 `--overlay` 与 `--surface` 是同一个值（`21.03% 0.003 253.83`），加上三个阴影令牌在暗色下都是 `inset` 透明——**今天暗色里弹窗压在卡片上是完全无边界的**。这条不需要改暗色窗口就能验证，而且它本身就是"去卡片化"的独立理由（内容区变回 12% 的窗口底之后，21.03% 的浮层才浮得起来）。
8. **R4 的字体栈收益被下调**。确认本仓**从未加载 Inter**（`package.json` 无字体包、`index.html` 无 webfont 链接），所以 macOS 上今天走的就是 `system-ui` = SF Pro。`-apple-system` 提前的真实收益是"装了 Inter 的机器不再被接管" + 统一两处不一致的声明；文档里按这个口径写，不夸大。
9. **新增 R11 强调色**（第 3 条按建议）：换 Apple 系统蓝，并顺手删掉 `index.css` 里重复的 `--focus`（库已有 `--focus: var(--accent)`）。白字在 `#007AFF` 上实测 4.02:1，记为已知偏离（§5.3）。
10. **`h-dvh` 内部滚动移出本轮**。上一版把它当作"应用感 vs 网页感"的分水岭，现在权衡为"三处回归风险（`SelectionBar` / `DropZone` / 移动端地址栏）换一个滚动条位置"，移到 §4 单独做。

### 6.4 执行记录

| 步 | 状态 | 结论 |
| --- | --- | --- |
| UI-11 | ✅ 完成 | **只改 `index.css` 的取值，一处 class 都没动**，所以 629 个测试全绿（验证了这个前提成立）。产物核对：`--radius:.3125rem`、`--radius-control`、`--color-hairline` 亮暗两个值、`--text-title` / `--text-large-title`、`--accent` 三个值（库默认 + 亮 `60.28%` + 暗 `62.43%`）、`--ease-out-fluid` 全部在 `dist/client/assets/index-*.css` 里。**覆盖是否真的赢**：结构验证——库的 `.button` 在 `@layer components` 内（`@layer components{` 起于 33007 字节，`@layer utilities{` 起于 400122），本项目的 `.button` 与字段配方都在 458k 之后的无层区，无层规则恒胜于分层输出；同一区域里的 `:where(input…)` 字段配方自 UI-10 起就在实际页面上生效，是这条机制的先例。全产物只有一处 `border-radius: … !important`，是 `rounded-full`，不在按钮上。顺带删掉了两处重复的 `--focus`（库已有 `--focus: var(--accent)`）。**遗留两项**：§5.8 的 computed style 实测与 §5.9 的亮暗截图没做——本机没有浏览器（`agent-browser` 未安装，装它要下 Chromium），应用的页面又需要 Worker 与 AK/SK 才渲染得出来；这两项挪到 UI-12 / UI-13 在浏览器里跑起来时一起补，在那之前"按钮是 8px"这个结论只建立在层叠规则上，不是实测。`markdown-body` 里 `code` / `pre` 的 `0.25rem` / `0.5rem` 字面量留给 UI-12。**（UI-12 回头做的两件事**：①§5.8 的层叠部分已从"结构推断"升级为"从产物量出来的实测"——`utilities` 层在 454785 闭合，项目规则在 458k 之后的无层区，中间没有层可输，见 §6.5 第 18 条；②上面那句"只建立在层叠规则上"因此不再成立，**仍未做的只剩 computed 像素读数**。） |
| UI-12 | ✅ 完成 | **同心复核：没有一处是肉眼可见的错；偏离等式的是 1 对，其余 29 处本来就对。** 按最终规则（以等式 `内层 = 外层 − 内边距` 为目标；偏深零容忍、偏浅 1px 容差）过完全仓配对，`SegmentedControl` 是唯一偏深的一对：外层 `rounded-lg`(5px) − `p-0.5`(2px) = 3px，而内层是 `rounded-md`(3.75px)，**偏深 0.75px**；改成 `rounded-[3px]`。菜单/浮条那对（15 / 4 / 10）偏浅 1px，**保留**（与库的 `.menu-item` 一致）。**注意**：这一行第一版写的是"只有一对真的坏了 + 偏大会切进外圈的弧"，**后半句被算式推翻过**，正确的性质见 §6.5 第 12 条。**清掉 6 处"冻结的 4px"**：裸 `rounded` 是 Tailwind 的固定 `.25rem`、**不跟 `--radius`**（`FileListSkeleton` / `FileTable` 表头 / `DirectoryTree` ×2 / `StorageTable` 的 `ACTION_CLASS` + 3 个骨架），全部换成阶梯步（`rounded-md`，3.75px，肉眼无差但从此跟随旋钮）。**`--radius-control` 落到实处**：Pager 三个按钮、`BackupPage` 的"选择文件"标签、`MetadataPage` 两个按钮骨架（原本是 `rounded-3xl`，比它照抄的真按钮还圆）。**`markdown-body` 的 `code` / `pre` 字面量**改成 `var(--radius-md)` / `var(--radius-lg)`（UI-11 留给这一步的）。**`metrics.ts` 提取 `FRAME_RADIUS`**，两个 Suspense 骨架不再各自写一遍 frame 的圆角——§3.10 说"不动预览几何"，这里一个像素都没动，只是把同一个值从三处收到一处。**8 处注释里的旧像素值全部重述**（"24px panel, 4px inset, 16px rows" → 15/4/10 等）。**验证**：`prettier` ✓ / `eslint` ✓ / `tsc -b` ✓ / `vitest` **632 passed**（629 + 新增守卫 3）/ `vite build` ✓；产物核对 `.rounded-control{border-radius:var(--radius-control)}`、`.rounded-\[3px\]{border-radius:3px}`、`.markdown-body code{border-radius:var(--radius-md)}`（且 `--radius-md` / `--radius-lg` 确实作为 `calc(var(--radius) * .75/1)` 输出，否则这两条会解析成无效值）。**新增 §5.10 的守卫测试**（计划外，见 §6.5 第 15 条）。**遗留**：§5.8 的 computed 像素读数与 §5.9 的亮暗截图，仍然只差一个浏览器。 |
| UI-13 | ⏳ 待办 | |
| UI-14 | ⏳ 待办 | |
| UI-15 | ⏳ 待办 | |
| UI-16 | ⏳ 待办 | |
| UI-17 | ⏳ 待办 | |
| UI-18 | ⏳ 待办 | |
| UI-19 | ✅ 完成（提前执行） | **登录页去掉卡片**。诊断：卡片什么也没做——窗口 96.4% 对卡片 100%，库的 `.card` 又没有边框，里面只有一个表单，所以整页读起来像"别的页面上撕下来的一块"。现在窗口色即页面，顶部一层 `page-glow` 给标识与标题"光"，**全屏只有两个升起的东西：白色的输入框**，按钮是唯一的强调色。另改：`max-w-md`(448) → `max-w-sm`(384)；标题 24px → `text-large-title`(28px)；标签 14px 纯黑 → 13px muted（新 token `--text-label`）；字段 `py-3` → `py-2.5`；按钮改用自身 `mt-6` 与字段节奏分开；错误条补 `arrive`（此前只有 `FilesPage` 的那条会动）；`main` 补 `relative`，让语言选择器锚在这一屏而不是文档上。**未按计划的一条**：计划说"输入框文字 15px"，**没做，保留 16px**（iOS Safari 聚焦 < 16px 的字段会缩放视口，见 §6.6 第 20 条）。验证：`prettier` ✓ / `eslint` ✓ / `tsc -b` ✓ / `vitest` 632 passed / `vite build` ✓；四个新 token / utility 全部从产物 grep 出来。 |

### 6.5 第三次修正（UI-12 执行中发现）

计划里这一步写的是"逐处复核 + 迁移 4 个文件的断言"。做完之后有两处判断被推翻，另外有三条只有动手才会撞上的事：

11. **§5.2 的前提是错的：那 4 个测试文件一个都没红。** 计划断定它们"几何一变就红"，实测 629 个全过。原因不是断言写得好，是它们钉的是**类名**——类名一个都没改，变的是类名解析出的 px，而静态渲染测试看不见那一层。所以这一步没有"迁移以恢复绿灯"这回事，只能：换掉唯一那条计划点名的（分段控件同心值）、修掉一条**假阳性**（`toContain("p-0.5")` 一直靠同一个 class 串里的 `gap-0.5` 命中，inset 掉了也会通过）、其余保持不动（它们是语义或规则，按"实现细节"迁移动它们只会削弱覆盖）。§5.2 已按实测改写。
12. **同心规则被改了两次，第二次是我自己写错的，被算式推翻。** 原文（计划里）是等式 `内层 = 外层 − 内边距`。我第一遍读库时发现库自己的菜单是 24 / 4 / 16（16 ≠ 20），于是把它改写成不等式 `内层 ≤ 外层 − 内边距`，理由写成"内层偏小只是角略紧，偏大才切进外圈的弧"。**后半句是错的。** 把两条弧写成参数方程算一下就知道：两条弧**永远不会相交**，无论内层半径取多大或多小 —— 内缩 p 本身已经保证了内层的弧恒在外层的弧内。偏大的真实后果是**角带在 45° 方向上变宽**（`R=220, p=88` 时，内层 132 → 间隙 88.0；内层 165 → 101.7；内层 300 → 157.6），极端处被 CSS 夹成胶囊；偏小是**角带变窄**（内层 88 → 69.8；内层 0 → 33.3，仍为正，所以也不重叠）。
    所以最终版回到"以等式为目标"，但把**两个方向的不对称**讲清楚 —— 这才是真正有价值的部分，而且它是**观感**上的不对称、不是几何上的：偏深是"想同心却没做到"的近似失误，**近似失误读起来像没对齐，明显的差异才读得像有意内缩**；偏浅是惯例，1px 以内安全（库自己的菜单行就是这样，改后是 15 / 4 / 10）。
    **教训写在这里**：第一遍的结论"只有 1 对坏了、其余 29 处"——**计数对了，性质说错了**（那 0.75px 是"不允许但肉眼看不出"，不是"切进了弧"）。§5.1 的规则、`SegmentedControl` 的注释、守卫测试的断言（一条变两条）都跟着改，见紧随的修正提交。
13. **§5.2 的前提是错的：那 4 个测试文件一个都没红。** 计划断定它们"几何一变就红"，实测 629 个全过。原因不是断言写得好，是它们钉的是**类名**——类名一个都没改，变的是类名解析出的 px，而静态渲染测试看不见那一层。所以这一步没有"迁移以恢复绿灯"这回事，只能：换掉唯一那条计划点名的（分段控件同心值）、修掉一条**假阳性**（`toContain("p-0.5")` 一直靠同一个 class 串里的 `gap-0.5` 命中，inset 掉了也会通过）、其余保持不动（它们是语义或规则，按"实现细节"迁移动它们只会削弱覆盖）。§5.2 已按实测改写。
14. **裸 `rounded` 是 Tailwind 的固定 `.25rem`，不跟随 `--radius`。** 产物里它是 `.rounded{border-radius:.25rem}`，与阶梯无关。这是"全仓无几何字面量"这条判据里最隐蔽的一类：**它看起来像阶梯成员，实际是内置常量**，所以降旋钮时它不会跟着动，而代码评审时也没人会觉得一个裸 `rounded` 可疑。清掉 6 处（`FileListSkeleton`、`FileTable` 表头、`DirectoryTree` ×2、`StorageTable` 的 `ACTION_CLASS` 与 3 个骨架）。**留下的教训**：查几何字面量不能只查 `[Npx]`，要连裸工具类一起查。
15. **新增了一条计划外的守卫（§5.10）**，放在 `src/react-app/geometry.test.ts`。理由见 §5.10，简短版：§5.1 担心的"配错了不会报错"，而 §5.2 又证明渲染测试看不见 px——那么**算术就是唯一还能自动守的东西**。它从 `index.css` 读 `--radius`（而不是抄一份 token 值），按阶梯算 px，断言**两个方向**（偏深零容忍 + 偏浅 1px 容差，见第 12 条与 §5.10）。**两个方向都验证过会红**：分段控件改回 3.75px → `inner 3.75px against 3px of room`；菜单行改成 `rounded-lg` → `inner 5px leaves 6px of the corner band unused`。边界写在文件头：只覆盖列出的配对，改配对时要改表。
16. **`--radius-control` 的适用范围是靠实做才说清的。** UI-11 只给了"按钮专用的一档"这句话，落地时立刻撞上三类边界，全部写进了 `index.css` 的 token 注释：①**面板内的控件**（右键菜单行、浮条动作）跟面板走（`rounded-2xl`）——因为同一个动作在两处出现，Menu 里 10px、浮条里 8px 就是"同一个按钮换了形状"；②**行内小按钮**（面包屑铅笔、表头排序、存储行动作，20-26px 高、hover 才出现盒子）取小阶梯步——8px 在 20px 的盒子上是个鹅卵石，而且存储行里它们旁边就有一个 `rounded-md` 的 driver chip，两个小盒子同排不同角才是真正的漂移；③**chip 是标签**，留在 `rounded-full`。同时发现一个副作用并写进注释：因为 `.button` 覆盖是无层的，`<HeroButton className="rounded-control">` **不会生效**（覆盖恒胜于工具类）——不需要它，但要知道。
17. **§3.10（不动 `metrics.ts`）与"无几何字面量"冲突了一处。** `MarkdownViewer` 和 `preview/index.tsx` 的 Suspense 骨架各自写了一遍 frame 的圆角，与 `metrics.ts` 的 `FRAME` 是同一个值的三份拷贝。**做法是提取而非改值**：新增 `FRAME_RADIUS`，`FRAME` 由它组合，两个骨架改用它——预览框的像素一个没动（`FRAME` 拼出来的串与原来逐字符相同，所以 `preview-views.test.tsx` 的断言也不需要改）。这样"全仓除 `metrics.ts` 外无几何字面量"这句话才成立。
18. **顺手升级了一种检查方法：产物 CSS 的层结构可以直接量出来。** 写一个按括号深度遍历顶层块的脚本，就能回答"我这条规则落在哪一层、前面还有哪些层"。UI-11 的 §5.8 因此从"结构推断"变成"实测"（`utilities` 层在 454785 闭合，项目规则在 458k 之后的无层区，中间没有层可输）。**没有浏览器时这是把"应该生效"变成"必然生效"的唯一办法**，值得留给后面几步。

**一条登记给后面的观感项**：预览面板的圆角是 `rounded-lg`，改后是 **5px**，出现在一个 640px 高的框上——它是全仓"最大的面配最小的角"，Apple 在这个尺度会更接近 10px。§3.10 禁止本轮动 `metrics.ts`，所以**不动**，登记在此，等有浏览器截图时看它是否显得过尖。

---

### 6.6 计划外的一步：登录页（UI-19，用户要求提前）

用户拿着当前登录页的截图说"真的很不好看"。这一步原本并进 UI-18，现在提前单独做，因此有四条要记：

19. **去掉卡片是这一步的全部要点，而它正好验证了 R2 的论点。** 原页面的毛病不是配色，是**卡片什么也没做**：窗口底 `96.4%` 对卡片 `100%` 只差 3.6 个百分点，库的 `.card` 既没有边框（UI-11 读库确认）也不带可见阴影，而卡片里装的东西只有一个表单。于是整页读起来不是"一个被抬起来的表单"，是"别的页面上撕下来的一块白纸飘在灰底上"——**这正是 §0.1 那句"所有东西都浮起来等于没有东西浮起来"在单页面尺度上的同一个错误**。去掉之后层级反而出现了：全屏只剩下两个升起的东西（白色的输入框），强调色只剩一处（按钮），"哪里可以打字"变成唯一被材质回答的问题。**这一步没有新增任何表面 token**，R2 的两档表面照旧（窗口 = 页面，`bg-surface` 仍只留给表单分组）。
20. **`--text-large-title` 从 UI-11 起就写着"只给登录页"，到这一步才有第一个使用者。** 同时新增 `--text-label`（13px + 行高）：标签从 `text-sm` 纯黑改 13px muted 是 R10 早就写下的，但 13px 若写成 `text-[13px]` 就是全仓第五处几何/字号字面量，而 UI-18 的三个表单页还要重复四次，所以它值得是一个 token。12px 是另一条路，对 CJK 标签太小。
    **计划里有一条没照做**：R10 写"输入框文字 15px"，**实际保留 16px（不写字号，继承文档）**。理由是 iOS Safari 在聚焦低于 16px 的字段时会缩放整个视口，而这个应用有手机使用场景（§5.6 的 390×844 判据）；15px 换来的那一点精致不值得每次聚焦都让页面跳一下。这是**有意偏离**，不是漏做。
21. **顶向渐变做成 `--page-glow` 双主题取值 + `@utility page-glow`，没有写成调用处的任意值。** 计划里给的是 `radial-gradient(120% 80% at 50% 0%, #fff, var(--background))`。直接用可以，但**任意值无法主题化**——暗色得再写一个带自己颜色的 class，两份就会漂。现在是亮色纯白、暗色 `oklch(20%)`，都落在同一行 `background-image` 里。渐变在半径 72% 处就到达窗口色，所以只有页面上部被抬亮，**任何半径上都找不到接缝**；横向半径取到 120%（超出窗口）是为了让横向衰减始终在屏外，只留纵向的一道。
22. **顺手对齐了两处小不一致，都不是新设计。** ①错误条补上 `arrive`：`FilesPage` 的错误条会动、登录页那条不会，两条错误条是同一个东西；`index.css` 里 `arrive` 的注释本来就写着"错误条在挂载的那一刻出现，所以没有 before 态可用"，这句话此前只对其中一个成立。②`main` 补 `relative`：语言选择器是 `absolute top-5 right-6`，此前**没有定位祖先**，位置是相对文档算出来的——因为登录页恰好就是整份文档，所以看不出问题；给 `main` 定位后它锚在这一屏上，预览里两个主题叠在一页时才不会挤到同一角落（也是 §5.9 那个预览能成立的前提）。
23. **`LogoMark` 一个像素都没动。** `size="lg"`（56px）在这一屏显得偏大是有的——列宽从 448 收到 384 之后它的占比从 12.5% 升到 14.6%——但"标识多大合适"属于 UI-16 的复查项，这一步改了就会和那一步的记录打架。**登记**：UI-16 顺手看一眼 56px 是否该降到 44px 左右（`size-11`）。

**这一步没有新依赖、没有新组件、没有改 i18n 文案**（"凭据由 Worker 安全校验。"这句技术性的小字保留原样——它读起来确实像实现说明而不像产品文案，但 §3.12 禁止本轮改写文案，要改应当单独作为一次文案工作）。

---

## 7. 已拍板（本轮）

四项都已定。**其中两项没有按我的建议走**，两条路线各自的代价记在下面——不是为了翻案，是为了下次有人问"为什么不做侧边栏""为什么暗色不是真黑"时，答案在这里而不是在某个人的记忆里。

| # | 问题 | 拍板结果 | vs 建议 | 代价与后果 |
| --- | --- | --- | --- | --- |
| 1 | **导航形态** | **保留顶栏药丸，只改几何与材质** | 我建议侧边栏，**未采纳** | 放弃 iCloud 的三层结构（"像 iCloud"上限约六成）；换来的是改动面小一半、不重做移动端导航模型。连带重算见 §6.3 第 6 条。**顺手修掉一个真 bug**：`<sm` 下导航不再整条消失 |
| 2 | **字体栈** | **`-apple-system` 提到 `Inter` 之前** | 与建议一致 | 收益比直觉小（本仓从未加载 Inter，macOS 本来就落在 SF Pro）；真实收益是"装了 Inter 的机器不再被接管" + 两处声明合并。见 R4 |
| 3 | **强调色** | **Apple 系统蓝：亮 `#007AFF` / 暗 `#0A84FF`** | 与建议一致 | 白字落在 `#007AFF` 上实测 4.02:1，低于 4.5:1，记为已知偏离（R11、§5.3）。比现在的 `#0485f7`（3.68:1）其实是变好 |
| 4 | **暗色窗口底色** | **保留 `oklch(12%)`** | 我建议真黑，**未采纳** | 首帧闪白与暗色对比度这两件事都不用重做。连带发现"暗色下 `--overlay` 与 `--surface` 同值，浮层本来就没有边界"，这条反而成了去卡片化的理由（§6.3 第 7 条） |

计划就此冻结：**按 §2 的顺序从 UI-11 开始**，每步一个本地 commit。执行中的修正在 §6.4 逐条记录；改到 R1–R11 任何一条时，先回来改规则再改代码。
