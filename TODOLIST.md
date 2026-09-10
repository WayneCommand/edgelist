# EdgeList TODO

目标：在 Cloudflare Workers 上实现一个兼容 OpenList 核心能力的 serverless 应用。

当前阶段：**按照 OpenList 的挂载模型与文件管理器交互做优化重构**。
差距分析见 [`IMPROVEMENT.md`](./IMPROVEMENT.md)，已拍板决策见其「第 0 节」。

## 约束与范围

- 使用 `pnpm`、Vite、React、Tailwind CSS；不要使用 npm/yarn 改动 lockfile。
- 前端代码放在 `src/react-app`，Worker 后端代码放在 `src/worker`。
- 参考实现：`~/IdeaProjects/OpenList` 和 `~/IdeaProjects/OpenList-Frontend`。
- 支持的存储类型：OpenList、对象存储（标准 S3 接口）、WebDAV。S3 适配器保持供应商中立，不引入 R2 专有行为。
- 登录使用 AK/SK；后端从 Cloudflare KV 读取并校验，不在前端保存密钥。
- 备份与还原需要保持 OpenList 双向兼容。
- **每个独立小步骤完成后创建一个本地 commit，不 push。**
- 每完成一步立刻回来勾选本文件的对应条目。

## 已拍板的决策

| # | 决策 | 落地步骤 |
| --- | --- | --- |
| 1 | 目录缓存先移除字段，阶段八再实现；备份层透传原值保证无损 | 0.2、0.3、8.5 |
| 2 | `folder_order` 改名为 `extract_folder`（`before/after` → `front/back`），双向迁移 | 0.4 |
| 3 | 跨存储复制/移动明确禁止，后端统一错误码，UI 明确提示 | 3.12、6.6 |
| 4 | 引入 react-router，路径对齐 OpenList `/`、`/@login`、`/@manage/*` | 5.1 |
| 5 | 禁止逻辑堆进 `App.tsx`，强制拆分组件 + 限制行宽 | 5.2、5.3 |

## 已完成的初始实现

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
- [x] 11. 实现文件传输 API（上传、下载、直链/重定向）。
- [x] 12. 实现 OpenList 兼容的备份导出格式。
- [x] 13. 实现 OpenList 兼容的备份导入与还原校验。
- [x] 14. 用 React + Tailwind 重建 OpenList 登录界面。
- [x] 15. 实现 OpenList 风格的文件浏览、搜索、操作和存储管理界面。
- [x] 16. 实现前端登录态、鉴权失败处理和备份/还原界面。
- [x] 17. 增加 API/适配器/备份还原测试与 OpenList 兼容性样例。
- [x] 18. 完成类型检查、lint、构建、Wrangler dry-run 和部署配置文档。
- [x] 19. 接入 Monaco 编辑器，支持文本与常见配置文件在线预览、编辑和保存。
- [x] 20. 合并真实目录项与直接子挂载，修复根存储和嵌套挂载互相遮挡的问题。
- [x] 21. 建立存储生命周期和驱动配置校验。
- [x] 22. 编写优化与重构分析报告 `IMPROVEMENT.md`。
- [x] 23. 按拍板结果复核优化步骤、消除冲突项、补齐遗漏项。

---

# 优化重构计划

> 每一步都是一次独立提交：`实现 + 测试 + 勾选 + commit`。
> 验收命令（视改动范围选择）：`pnpm test`、`pnpm lint`、`pnpm exec tsc -b`、`pnpm build`。
>
> **阶段零必须先做**：0.4 的 `extract_folder` 改名是阶段一排序（1.10）的前置；
> 0.1–0.3 的假字段清理决定阶段二 items（2.4）包含哪些字段。顺序反了会返工。

## 阶段零：数据模型对齐与假字段清理

> 依据 `IMPROVEMENT.md` 第 4 节 C3。原则：表单里每一项必须真生效，或被诚实移除。
> **关键**："从 UI 移除" ≠ "从数据删除"。`normalizeStorageConfig` 是 spread 保留未知字段，
> 所以备份导入时这些字段仍留在 KV、导出时原样带出，双向迁移无损。

- [x] 0.1 移除 `disable_index` 与 `enable_sign`：从 `StorageConfig` 类型与前端表单移除（无索引/签名实现，属假功能）。
- [x] 0.2 移除 `cache_expiration` 与 `custom_cache_policies`（决策 1）：从类型与表单移除，备份层透传保留。
- [x] 0.3 代理字段 `web_proxy` / `down_proxy_url` / `disable_proxy_sign` / `webdav_policy` **当前均未实现**：`/d/*` 恒为代理流式转发（S3 `read` 直接返回上游响应），从不 302。从表单移除；后续要支持 302 直链需配合 3.5 的 `/api/fs/link`。
- [x] 0.4 `folder_order` → `extract_folder` 改名（决策 2）：值 `before/after` → `front/back`，`normalizeStorageConfig` 双向迁移。
- [x] 0.5 `order_by` 合法值统一为 `name / size / modified`，移除 `created`；`refresh` 参数保留（客户端兼容）并在文档标注为 no-op。
- [x] 0.6 `webdav_policy` 取值统一为 `302_redirect / use_proxy_url / native_proxy`，旧值（`302` / `proxy`）在 `normalizeStorageConfig` 迁移（配合 0.3：当前字段不生效，备份仍透传）。
- [x] 0.7 补单测：备份导入含旧字段名/旧值时迁移正确，导出后能被 OpenList 识别。

## 阶段一：文件对象模型与挂载解析

- [x] 1.1 新增 `ObjMask` 位定义与常量（`Virtual / NoRename / NoRemove / NoMove / NoCopy / NoWrite / Locked / ReadOnly`），对齐 `internal/model/obj.go:239-257`。
- [x] 1.2 `FileObject` 增加 `mask` 字段，三个适配器与虚拟目录生成处填默认值 `0`。
- [x] 1.3 `FileObject` 增加 `provider`（驱动名）与 `hashinfo`；S3 填充时排除形如 `"etag-N"` 的分片 ETag（非 MD5）。顺带修了 S3 返回的 `&quot;` 实体未被剥离，导致 `hashinfo.etag` 带引号的老 bug。
- [x] 1.4 抽出纯函数 `selectStorage(configs, path)`：按挂载**层级深度**降序做最长前缀匹配，跳过 `disabled` 挂载；替换 `factory.ts` 的字符串长度排序。
- [x] 1.5 `selectStorage` 补单测：root 挂载、一级挂载、嵌套 `/a` + `/a/b`、前缀误匹配 `/ab` vs `/a`、disabled 回退到外层挂载。
- [ ] 1.6 `listVirtualMounts` 区分"真实挂载点"（`Locked | Virtual`）与"中间层"（`ReadOnly | Virtual`），参考 `internal/op/storage.go:378-443`。
- [ ] 1.7 虚拟目录生成补单测：单层、多层嵌套、同名去重、被真实目录占用时的优先级。
- [ ] 1.8 新增 `src/worker/sort.ts`：`compareNatural`（数字分段自然序）、`sortObjects(items, orderBy, orderDirection)`、`extractFolder(items, position)`。
- [ ] 1.9 `sort.ts` 补单测：自然序（`file-2` < `file-10`）、size/modified、asc/desc、目录前置/后置稳定性。
- [ ] 1.10 `fsList` 在合并虚拟目录后、分页前应用排序（先 `sortObjects` 再 `extractFolder`）；优先级：请求参数 > 命中 storage 的 `extract_folder`（0.4 已就绪）> 全局默认。
- [ ] 1.11 `fsGet` 虚拟目录返回 storage 的 `modified` 与 `mask`，不再固定返回 epoch 时间。

## 阶段二：驱动注册表与配置项

- [ ] 2.1 新增 `src/worker/storage/registry.ts`，定义 `DriverDefinition { name, key, config, items, create, checkStatus? }`。
- [ ] 2.2 定义 `DriverConfig`（`localSort / noCache / noUpload / onlyProxy / noLinkUrl / preferProxy / noOverwriteUpload`）与 `Item { name, type, default, options, required, help }`，对齐 `internal/driver/config.go`、`internal/driver/item.go`。
- [ ] 2.3 为三个驱动声明 `additional` items（S3：endpoint/region/bucket/access_key_id/secret_access_key/session_token/force_path_style/list_object_version 等；WebDAV：url/username/password/root_folder_path 等；OpenList：base_url/token/username/password）。
- [ ] 2.4 实现公共 items 生成，字段集合**以阶段零清理后的结果为准**（不再含 cache/index/sign 字段）。
- [ ] 2.5 新增 `GET /api/admin/driver/names`、`GET /api/admin/driver/list`、`GET /api/admin/driver/info?driver=xxx`。
- [ ] 2.6 适配器 `capabilities` 改为从 registry 读取（三个适配器的 `new Set([...])` 内联声明全部移除）。已核实：`openlist` 的 `merge` 确实传给了上游，声明属实。
- [ ] 2.7 补单测：driver 端点输出、items 字段名与默认值、能力集合与 registry 一致。

## 阶段三：后端 API 补齐

- [ ] 3.1 新增 `POST /api/fs/dirs`，返回目录树供复制/移动目标选择；含虚拟挂载目录。
- [ ] 3.2 新增 `POST /api/fs/remove_empty_directory`，递归清理空目录并拒绝虚拟挂载点。
- [ ] 3.3 `fsMkdir` 支持递归创建父目录（对齐 `internal/op/fs.go:305`）。
- [ ] 3.4 `fsRemove` 改为并发执行并逐项返回结果，失败不再中断整批。
- [ ] 3.5 新增 `POST /api/fs/link`，返回直链（要求已登录，对齐 OpenList 的 admin 约束）。
- [ ] 3.6 `/d/*` 下载补 `Content-Disposition` 文件名与 RFC 5987 编码。
- [ ] 3.7 `fsSearch` 增加深度与目录数上限，避免 Workers CPU 超时；返回截断标记。
- [ ] 3.8 存储列表接口支持 `page/per_page` 分页。
- [ ] 3.9 新增 `PUT /api/fs/form`（multipart/form-data 上传）。
- [ ] 3.10 新增 `/api/fs/multipart/{init,chunk,complete,status,abort}` 分片上传骨架；**仅 S3 驱动可用**，其他驱动超阈值时直接拒绝并返回明确错误。
- [ ] 3.11 分离 create / update 语义：`/api/admin/storage/update` 校验 `id > 0`，新增走 `/create`。
- [ ] 3.12 跨存储复制/移动统一错误码与消息（决策 3），让前端能识别并给出确定性中文提示，而非透传后端英文原文。

## 阶段四：Meta ACL 与权限

- [ ] 4.0 补全 `src/worker/meta.ts` 的 `MetaConfig` 字段（`hide` / `h_sub` / `readme` / `r_sub` / `header` / `header_sub` / `p_sub` / `w_sub`），对齐 `internal/model/meta.go:3-20`。
- [ ] 4.1 实现 `getNearestMeta(path)`：沿父目录向上找最近规则，支持 `*_sub` 子目录开关。
- [ ] 4.2 实现 `canRead / canWrite / canAccess`（含 `hide` 正则、密码校验）。
- [ ] 4.3 `fs/list`、`fs/get` 接入 `canAccess` 与隐藏过滤。
- [ ] 4.4 `fs/mkdir`、`fs/rename`、`fs/remove`、`fs/move`、`fs/copy`、`fs/put` 接入 `canWrite`。
- [ ] 4.5 写操作接入 `ObjMask` 校验（`NoRename / NoRemove / NoMove / NoCopy / NoWrite`）。
- [ ] 4.6 Meta ACL 与掩码校验补单测。

## 阶段五：前端工程结构与可读性

> 依据决策 4、决策 5。排在阶段四之后，等后端字段稳定再拆前端，避免拆完又改。

- [ ] 5.1 引入 `react-router`，路由对齐 OpenList：`/`、`/@login`、`/@manage/*`（决策 4）。
- [ ] 5.2 建立可读性规范（决策 5）：Prettier `printWidth: 120` 或 ESLint `max-len`，纳入 `pnpm lint`。
- [ ] 5.3 拆分 `App.tsx`：`pages/{Files,Storages,Metadata,Backup,Login}Page.tsx` + `components/**`；`App.tsx` 只保留壳与路由出口。
- [ ] 5.4 抽出通用组件：`components/common/Modal.tsx`、`ConfirmDialog.tsx`（替换全部 `confirm()`）、Toast（复用 HeroUI）。
- [ ] 5.5 抽出 `hooks/useAuth.ts` 与 token 存储，替换散落的 `sessionStorage` 调用。
- [ ] 5.6 跑通 `pnpm lint` / `pnpm build`，确认无功能回归且无超长行残留。

## 阶段六：文件管理器交互

- [ ] 6.1 列表多选：checkbox 模式 + Shift 连选，替换单选 `selected` 状态。
- [ ] 6.2 抽出 `components/files/Toolbar.tsx`：刷新/新建文件夹/上传/视图切换/排序/全选。
- [ ] 6.3 新增网格视图 `components/files/FileGrid.tsx` 与视图切换持久化（localStorage）。
- [ ] 6.4 列表头点击排序（name/size/modified），排序偏好按路径持久化。
- [ ] 6.5 选中态底部操作条：重命名/复制/移动/删除/下载/复制链接。
- [ ] 6.6 复制/移动对话框：目录选择树（复用 3.1 的 `/api/fs/dirs`）+ overwrite/skip_existing/merge；**跨存储时禁用并提示**（决策 3，消费 3.12 的错误码）。
- [ ] 6.7 右键菜单 `components/files/ContextMenu.tsx`，按 `mask`（1.1）禁用不可用项。
- [ ] 6.8 拖放上传（含目录递归），替换单文件 `<input type="file">`。
- [ ] 6.9 分页/加载更多 `components/files/Pager.tsx`（替换硬编码 `per_page: 200`）。
- [ ] 6.10 面包屑支持路径直接编辑跳转。
- [ ] 6.11 按 `mask` 隐藏挂载点/只读项的重命名、移动、删除入口（与 6.7 共用掩码常量）。

## 阶段七：存储管理（磁盘管理器）

- [ ] 7.1 存储列表改为表格：`mount_path / driver / order / status / remark / 操作`，支持 driver 筛选。
- [ ] 7.2 接启用/禁用操作（后端已有 `storageEnable/storageDisable`）。
- [ ] 7.3 接"重载全部"（`storage/load_all`）与刷新按钮。
- [ ] 7.4 新增 `components/storage/DriverField.tsx`：按 `Item.type` 渲染 string/number/bool/text/select。
- [ ] 7.5 重写 `components/storage/StorageForm.tsx`：拉 `/api/admin/driver/list` 动态渲染公共项 + 驱动项，删除硬编码字段。
- [ ] 7.6 表单支持切换驱动时重置 addition 并按 `Item.default` 回填。
- [ ] 7.7 表单支持 `required` 校验、`help` 提示、`options` 下拉。
- [ ] 7.8 存储删除改为二次确认弹窗（替换 `confirm()`，复用 5.4）。
- [ ] 7.9 表单支持 JSON 导入/导出 addition（对齐 OpenList）。
- [ ] 7.10 前端按新增/编辑分别调 `/create` 与 `/update`（配合 3.11）。

## 阶段八：增强（预览 / 缓存 / 上传）

- [ ] 8.1 抽出预览分派器 `components/files/preview/index.tsx`，按扩展名选择预览器。
- [ ] 8.2 图片预览、视频/音频预览。
- [ ] 8.3 PDF / Office / markdown 预览。
- [ ] 8.4 README 渲染（header/readme/footer 三个 md）。
- [ ] 8.5 目录缓存实现（决策 1 闭环）：用 `caches.default` 按 `mount_path + path` 缓存列表，TTL 取 `cache_expiration`，`refresh` 绕过；**恢复 0.2 移除的字段**。
- [ ] 8.6 前端分片上传接入 `/api/fs/multipart/*`；非 S3 驱动时降级并提示上限。
- [ ] 8.7 前端上传体积上限提示与失败重试。
- [ ] 8.8 i18n 骨架（中/英），与 OpenList 文案风格对齐。

---

## 明确排除的范围

以下不在本次重构范围，避免误判为遗漏：WebDAV/S3/FTP/SFTP **服务端**、离线下载、分享链接、
全文搜索索引、归档解压、`.balance` 负载均衡、签名直链 `/p/*`、站点设置 API、多用户管理、完整语言包。
详见 `IMPROVEMENT.md` 第 5 节。

## 验收清单

- [x] 未登录请求不能访问受保护 API。
- [x] AK/SK 只在 Worker 侧从 KV 读取并校验。
- [x] 三种存储均可完成基本浏览和文件操作。
- [x] OpenList 客户端可调用已实现的兼容 API。
- [x] OpenList 备份可以导入，导出的备份可以被 OpenList 还原。
- [x] `pnpm check` 通过，且不需要 push 即可完成本地验证。
- [x] `.md`、`.yaml`、`.txt` 等文本文件可以在线编辑并保存回原存储。
- [ ] 表单里不再存在"能改但不生效"的字段（假字段清理完成）。
- [ ] `extract_folder` 改名后，旧备份导入、新备份导出到 OpenList 均正确。
- [ ] 挂载点目录在列表中可识别为磁盘，重命名/删除/移动入口被正确禁用。
- [ ] 嵌套挂载 `/a` + `/a/b` 可正确路由，禁用 `/a/b` 后回退到 `/a`。
- [ ] 文件列表支持按名称（自然序）/大小/时间排序，目录前置。
- [ ] 存储表单由 `/api/admin/driver/list` 驱动，新增驱动不需要改前端。
- [ ] Meta 规则对 `fs/*` 生效（读/写/隐藏/密码）。
- [ ] 文件页支持多选、右键菜单、网格视图、列头排序。
- [ ] 跨存储复制/移动被禁用且给出中文提示。
- [ ] `App.tsx` 只剩路由壳；`pnpm lint` 无超长行报错。
- [ ] `pnpm test` / `pnpm lint` / `pnpm build` 全绿。

## Commit 约定

每个步骤使用一个清晰的本地 commit，例如：

```text
feat: add ObjMask to file objects
fix: select storage by mount depth
test: cover nested mount resolution
refactor: split App.tsx into pages
```
