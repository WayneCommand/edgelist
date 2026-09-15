# UI 改进项 - better-ui 审查

基于 better-ui 技能对 `src/react-app` 的视觉细节审查，发现以下改进项：

## 1. 圆角不匹配（Concentric border radius）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| MEDIUM | `App.tsx:39-41` | Logo 容器使用 `rounded-xl`，但导航按钮使用 `rounded-lg`，内外圆角不匹配 | 统一使用 `rounded-lg` 或确保外层容器圆角 = 内层圆角 + padding |
| MEDIUM | `FileTable.tsx:118` | 行没有圆角，但外层容器有 `rounded-xl` | 添加 `rounded-lg` 或调整外层容器圆角 |
| MEDIUM | `StorageTable.tsx:60` | 行没有圆角，但外层容器有 `rounded-xl` | 添加 `rounded-lg` 或调整外层容器圆角 |
| LOW | `DropZone.tsx:70` | 覆盖层使用 `rounded-xl`，但内部文本没有圆角 | 保持一致或添加内层圆角 |

## 2. 过渡属性不完整（Transition only what changes）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| HIGH | `index.css:121` | 输入框使用 `transition` 但没有指定具体属性，可能导致不必要的性能开销 | 明确指定 `transition-property: border-color, box-shadow` |
| MEDIUM | `FileTable.tsx:118` | 行没有过渡效果，hover 状态变化生硬 | 添加 `transition-colors` |
| MEDIUM | `PathBar.tsx:81` | 编辑按钮没有过渡效果 | 添加 `transition-colors` |
| LOW | `ContextMenu.tsx:55` | 使用 `transition-colors`，但可以考虑添加 `duration-150` | 保持现有实现，已符合规范 |

## 3. will-change 过度使用（Use will-change sparingly）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| MEDIUM | `App.css:8` | `.logo` 使用 `will-change: filter`，但动画不频繁 | 移除 `will-change`，或仅在 hover 时添加 |

## 4. 主题切换过渡（Suppress transitions on theme switch）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| MEDIUM | 全局 | 没有主题切换时的过渡抑制处理，切换主题时所有元素同时过渡会导致视觉混乱 | 在主题切换时注入 `transition: none !important`，强制 reflow，下一帧恢复 |

## 5. 按压缩放（Scale on press）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| LOW | 所有按钮 | 没有按钮使用按压缩放效果（`scale(0.96)`） | 为主要交互按钮添加按压缩放效果 |

## 6. 图标与文本对齐（Optical over geometric alignment）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| LOW | `App.tsx:39-42` | Logo "E" 图标和 "EdgeList" 文本的对齐可能需要光学调整 | 检查对齐，必要时添加 padding 调整 |
| LOW | `PathBar.tsx:83` | "✎" 图标和文本的对齐 | 检查对齐，确保光学对齐 |

## 7. 动画属性明确性（Transition only what changes）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| MEDIUM | `StorageFields.tsx:83` | 使用 `transition` 但没有指定属性 | 明确指定 `transition-property: border-color, box-shadow` |
| MEDIUM | `DriverField.tsx:11` | 使用 `transition` 但没有指定属性 | 明确指定 `transition-property: border-color, box-shadow` |
| LOW | `FileToolbar.tsx:142` | 使用 `transition-colors`，已符合规范 | 保持现有实现 |

## 8. 入场动画（Split and stagger enter animations）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| LOW | `FilesPage.tsx` | 文件列表加载时没有入场动画 | 考虑为文件列表添加交错入场动画 |

## 9. 退出动画（Subtle exit animations）

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| LOW | `SelectionBar.tsx` | 选择栏消失时没有退出动画 | 考虑添加微妙的退出动画（小固定 translateY） |

## 10. 其他观察

| 严重度 | 位置 | 问题描述 | 建议修复 |
|--------|------|----------|----------|
| LOW | `App.css:1-42` | 包含未使用的样式（`.logo`, `.card`, `.read-the-docs`） | 清理未使用的样式 |
| LOW | `LoginPage.tsx:48` | Logo 使用 `rounded-2xl`，与 App.tsx 中的 `rounded-xl` 不一致 | 统一圆角值 |

## 验证说明

- **已验证**：所有文件的圆角、过渡属性、will-change 使用
- **未验证**：主题切换过渡处理（需要实际运行时测试）
- **未验证**：按压缩放效果（需要实际交互测试）
- **未验证**：入场/退出动画（需要实际运行时测试）

## 总结

**状态：Approve**（无 HIGH 严重度问题阻塞）

主要改进方向：
1. 统一圆角系统，确保内外圆角匹配
2. 明确指定所有过渡属性
3. 考虑添加主题切换过渡抑制
4. 清理未使用的 CSS 样式

这些问题都是视觉细节优化，不影响功能，但可以提升用户体验的精致度。