# EdgeList TODO

目标：在 Cloudflare Workers 上实现一个兼容 OpenList 核心能力的 serverless 应用。

## 约束与范围

- 使用 `pnpm`、Vite、React、Tailwind CSS。
- 前端代码放在 `src/react-app`，Worker 后端代码放在 `src/worker`。
- 参考实现：`~/IdeaProjects/OpenList` 和 `~/IdeaProjects/OpenList-Frontend`。
- 支持的存储类型：OpenList、对象存储、WebDAV。
- 后端只实现：存储管理、文件/目录元信息、备份、还原。
- 登录使用 AK/SK；后端从 Cloudflare KV 读取并校验，不在前端保存密钥。
- 备份与还原需要保持 OpenList 兼容。
- 每个独立小步骤完成后创建一个本地 commit，不 push。

## 实施步骤

- [x] 1. 建立项目 TODO、提交规范和验收清单。
- [x] 2. 对照 OpenList 参考代码梳理 API、数据模型、备份格式和认证行为。
- [x] 3. 升级并固定项目基础配置，接入 Tailwind CSS 与 pnpm 工作流。
- [x] 4. 建立 Worker 的配置类型、KV 绑定和统一错误/响应模型。
- [x] 5. 实现 AK/SK 登录、KV 校验、会话令牌和鉴权中间件。
- [x] 6. 实现 OpenList 兼容的存储配置模型与存储适配器接口。
- [x] 7. 实现 OpenList 存储适配器。
- [x] 8. 实现标准 S3 对象存储适配器。
- [x] 9. 实现 WebDAV 存储适配器。
- [x] 10. 实现文件/目录元信息 API（列表、详情、创建目录、删除、重命名）。
- [x] 11. 实现文件传输 API（上传、下载、直链/重定向及必要的分片行为）。
- [x] 12. 实现 OpenList 兼容的备份导出格式。
- [x] 13. 实现 OpenList 兼容的备份导入与还原校验。
- [x] 14. 用 React + Tailwind 重建 OpenList 登录界面。
- [x] 15. 实现 OpenList 风格的文件浏览、搜索、操作和存储管理界面。
- [x] 16. 实现前端登录态、鉴权失败处理和备份/还原界面。
- [x] 17. 增加 API/适配器/备份还原测试与 OpenList 兼容性样例。
- [x] 18. 完成类型检查、lint、构建、Wrangler dry-run 和部署配置文档。
- [x] 19. 接入 Monaco 编辑器，支持文本与常见配置文件在线预览、编辑和保存。

## 挂载模型重构

- [x] 合并真实目录项与直接子挂载，修复根存储和嵌套挂载互相遮挡的问题。
- [x] 建立存储生命周期和驱动配置校验。
- [ ] 扩展复制、移动、批量操作和适配器能力声明。
- [ ] 将 Metadata 规则接入文件访问控制。

## 验收清单

- [x] 未登录请求不能访问受保护 API。
- [x] AK/SK 只在 Worker 侧从 KV 读取并校验。
- [x] 三种存储均可完成基本浏览和文件操作。
- [x] OpenList 客户端可调用已实现的兼容 API。
- [x] OpenList 备份可以导入，导出的备份可以被 OpenList 还原。
- [x] `pnpm check` 通过，且不需要 push 即可完成本地验证。
- [x] `.md`、`.yaml`、`.txt` 等文本文件可以在线编辑并保存回原存储。

## Commit 约定

每个步骤使用一个清晰的本地 commit，例如：

```text
feat: add OpenList-compatible auth
```
