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

> ✅ **阶段零已完成**（7/7）。归一化统一收敛在 `normalizeStorageConfig` 的 `SelectRule`（`EXTRACT_FOLDER` / `ORDER_BY` / `WEBDAV_POLICY`）。

## 阶段一：文件对象模型与挂载解析

- [x] 1.1 新增 `ObjMask` 位定义与常量（`Virtual / NoRename / NoRemove / NoMove / NoCopy / NoWrite / Locked / ReadOnly`），对齐 `internal/model/obj.go:239-257`。
- [x] 1.2 `FileObject` 增加 `mask` 字段，三个适配器与虚拟目录生成处填默认值 `0`。
- [x] 1.3 `FileObject` 增加 `provider`（驱动名）与 `hashinfo`；S3 填充时排除形如 `"etag-N"` 的分片 ETag（非 MD5）。顺带修了 S3 返回的 `&quot;` 实体未被剥离，导致 `hashinfo.etag` 带引号的老 bug。
- [x] 1.4 抽出纯函数 `selectStorage(configs, path)`：按挂载**层级深度**降序做最长前缀匹配，跳过 `disabled` 挂载；替换 `factory.ts` 的字符串长度排序。
- [x] 1.5 `selectStorage` 补单测：root 挂载、一级挂载、嵌套 `/a` + `/a/b`、前缀误匹配 `/ab` vs `/a`、disabled 回退到外层挂载。
- [x] 1.6 `listVirtualMounts` 区分"真实挂载点"（`Locked | Virtual`）与"中间层"（`ReadOnly | Virtual`），参考 `internal/op/storage.go:378-443`。
- [x] 1.7 虚拟目录生成补单测：单层、多层嵌套、同名去重、被真实目录占用时的优先级。
- [x] 1.8 新增 `src/worker/sort.ts`：`compareNatural`（数字分段自然序）、`sortObjects(items, orderBy, orderDirection)`、`extractFolder(items, position)`。
- [x] 1.9 `sort.ts` 补单测：自然序（`file-2` < `file-10`）、size/modified、asc/desc、目录前置/后置稳定性。
- [x] 1.10 `fsList` 在合并虚拟目录后、分页前应用排序（先 `sortObjects` 再 `extractFolder`）；优先级：请求参数 > 命中 storage 的 `extract_folder`（0.4 已就绪）> 全局默认。
- [x] 1.11 `fsGet` 虚拟目录返回 storage 的 `modified` 与 `mask`，不再固定返回 epoch 时间。

> ✅ **阶段一已完成**（11/11）。新增 `src/worker/sort.ts`；挂载选择走 `selectStorage`（深度优先 + 跳过 disabled）；
> 虚拟目录带 `mask`（`Locked|Virtual` / `ReadOnly|Virtual`）与所属 storage 的 `modified`。

## 阶段二：驱动注册表与配置项

- [x] 2.1 新增 `src/worker/storage/registry.ts`，定义 `DriverDefinition { name, key, config, items, create, checkStatus? }`。
- [x] 2.2 定义 `DriverConfig`（`localSort / noCache / noUpload / onlyProxy / noLinkUrl / preferProxy / noOverwriteUpload`）与 `Item { name, type, default, options, required, help }`，对齐 `internal/driver/config.go`、`internal/driver/item.go`。
- [x] 2.3 为三个驱动声明 `additional` items（S3：endpoint/region/bucket/access_key_id/secret_access_key/session_token/force_path_style/list_object_version 等；WebDAV：url/username/password/root_folder_path 等；OpenList：base_url/token/username/password）。
- [x] 2.4 实现公共 items 生成，字段集合**以阶段零清理后的结果为准**（不再含 cache/index/sign 字段）。
- [x] 2.5 新增 `GET /api/admin/driver/names`、`GET /api/admin/driver/list`、`GET /api/admin/driver/info?driver=xxx`。
- [x] 2.6 适配器 `capabilities` 改为从 registry 读取（三个适配器的 `new Set([...])` 内联声明全部移除）。已核实：`openlist` 的 `merge` 确实传给了上游，声明属实。
- [x] 2.7 补单测：driver 端点输出、items 字段名与默认值、能力集合与 registry 一致。

## 阶段三：后端 API 补齐

- [x] 3.1 新增 `POST /api/fs/dirs`，返回目录树供复制/移动目标选择；含虚拟挂载目录。
- [x] 3.2 新增 `POST /api/fs/remove_empty_directory`，递归清理空目录并拒绝虚拟挂载点。
- [x] 3.3 `fsMkdir` 支持递归创建父目录（对齐 `internal/op/fs.go:305`）。
- [x] 3.4 `fsRemove` 改为并发执行并逐项返回结果，失败不再中断整批。
- [x] 3.5 新增 `POST /api/fs/link`，返回直链（要求已登录，对齐 OpenList 的 admin 约束）。
- [x] 3.6 `/d/*` 下载补 `Content-Disposition` 文件名与 RFC 5987 编码。
- [x] 3.7 `fsSearch` 增加深度与目录数上限，避免 Workers CPU 超时；返回截断标记。
- [x] 3.8 存储列表接口支持 `page/per_page` 分页。
- [x] 3.9 新增 `PUT /api/fs/form`（multipart/form-data 上传）。
- [x] 3.10 新增 `/api/fs/multipart/{init,chunk,complete,status,abort}` 分片上传骨架；**仅 S3 驱动可用**，其他驱动超阈值时直接拒绝并返回明确错误。
- [x] 3.11 分离 create / update 语义：`/api/admin/storage/update` 校验 `id > 0`，新增走 `/create`。
- [x] 3.12 跨存储复制/移动统一错误码与消息（决策 3），让前端能识别并给出确定性中文提示，而非透传后端英文原文。
- [x] 3.13 S3 适配器支持 `root_folder_path`（阶段二建 registry 时发现：UI 一直有这个字段且标为必填，但 S3 把路径直接当 key，从未读取，属假字段）。二选一：实现前缀拼接到 `objectPath()`，或从表单彻底移除；目前 registry 已暂不声明它。

## 阶段四：Meta ACL 与权限

- [x] 4.0 补全 `src/worker/meta.ts` 的 `MetaConfig` 字段（`hide` / `h_sub` / `readme` / `r_sub` / `header` / `header_sub` / `p_sub` / `w_sub`），对齐 `internal/model/meta.go:3-20`。
- [x] 4.1 实现 `getNearestMeta(path)`：沿父目录向上找最近规则，支持 `*_sub` 子目录开关。
- [x] 4.2 实现 `canRead / canWrite / canAccess`（含 `hide` 正则、密码校验）。
- [x] 4.3 `fs/list`、`fs/get` 接入 `canAccess` 与隐藏过滤。
- [x] 4.4 `fs/mkdir`、`fs/rename`、`fs/remove`、`fs/move`、`fs/copy`、`fs/put` 接入 `canWrite`。
- [x] 4.5 写操作接入 `ObjMask` 校验（`NoRename / NoRemove / NoMove / NoCopy / NoWrite`）。
- [x] 4.6 Meta ACL 与掩码校验补单测。

## 阶段五：前端工程结构与可读性

> 依据决策 4、决策 5。排在阶段四之后，等后端字段稳定再拆前端，避免拆完又改。

- [x] 5.1 引入 `react-router`，路由对齐 OpenList：`/`、`/@login`、`/@manage/*`（决策 4）。`routes.ts` 增加 `ROUTES` 常量表与 `login` kind；`RequireAuth` 负责跳登录并记住来源，`Shell` 渲染 `<Outlet />`。**注意**：Cloudflare 静态资源会把 `/@login` 307 到 `/%40login`，所以 `routeFor` 必须先解码（见 5.6）。
- [x] 5.2 建立可读性规范（决策 5）：`.prettierrc` 固定 `printWidth: 120` + tab + 双引号 + 分号；`.prettierignore` 排除生成物；`pnpm format` 重写，`pnpm lint` 改为 `eslint . && prettier --check src`，格式漂移会直接让 lint 失败。
- [x] 5.3 拆分 `App.tsx`：`pages/{Files,Storages,Metadata,Backup,Login}Page.tsx` + `components/{common,files,storage}/**` + `lib/{api,types,format,storage}.ts`；`App.tsx` 只剩 `RequireAuth`、`Shell`、路由表与 `NAV_ITEMS`。
- [x] 5.4 抽出通用组件：`components/common/Modal.tsx`、`ConfirmDialog.tsx`（`useConfirm()` 以 Promise 形式替换全部 3 处 `confirm()`）、`hooks/useNotify.ts`（复用 HeroUI toast，顺带删掉了 `notice` state + effect 的 setState-in-effect 报错）。
- [x] 5.5 抽出 `hooks/useAuth.ts` 与 token 存储，替换散落的 `sessionStorage` 调用。用 `useSyncExternalStore` 做外部 store，401 直接 `clearAuthToken()`，`edgelist-auth-expired` 自定义事件已删除。
- [x] 5.6 跑通 `pnpm lint` / `pnpm build`，确认无功能回归且无超长行残留。
  - 全绿项：`pnpm test`（124 passed）、`tsc -b`、`eslint .`（0 error）、`prettier --check src`、`vite build`、`wrangler deploy --dry-run`。
  - 为让 `eslint .` 归零：ESLint 增加 `^_` 忽略规则（适配器必须保留接口声明的参数）；`fs.ts` 两处空 `catch {}` 补上"为什么可以吞掉"的注释；`MonacoTextEditor` 原先用活着的 `value` 当种子却只声明 `[language, path]` 依赖，改为 `useState` 只取一次种子，声明依赖与实际一致；生成物 `worker-configuration.d.ts` 加入 ESLint `ignores`。
  - **遗留**：仍有 14 行超过 120 列，全部是 Prettier 无法拆分的字符串字面量（Tailwind class、S3 XML 测试夹具）。`prettier --check` 通过即证明代码部分已无可拆之处，如需硬性归零只能把这些字符串抽成常量，但那只是把长行换个位置。
  - **附带修复**：`location.pathname` 保留百分号转义。原先 `/%40login` 会掉进文件页，含空格或中文的目录名会带着 `%20`/`%E4%B8%AD` 直接发给 `fs/list`。`routeFor` 现在先解码（非法转义序列按原样返回），并补了 3 个单测。
  - **已知限制**：Cloudflare 静态资源对导航请求把 `/@login` 307 到 `/%40login`，地址栏会显示编码后的形式。这是 `@` 前缀在 Workers 上的固有行为，不影响功能（react-router 匹配时会自行解码）。

## 阶段六：文件管理器交互

> 目标是把「能用」的文件列表做成「好用」的文件管理器。后端早已批量就绪（`fs/remove` 收 `names[]`，`fs/copy`/`fs/move` 收 `names` 且逐项返回 `status`），所以本阶段基本都是前端工作。

- [x] 6.1 列表多选：checkbox 模式 + Shift 连选，替换单选 `selected` 状态。
  - 新增 `hooks/useSelection.ts`：以 `path` 作为身份（不是下标，列表重排后选中项不会串位），`anchor` 用 `useRef` 记录 Shift 连选的起点，`items` 是 `visible.filter(...)` 所以选中集合天然按列表顺序。
  - `rangePaths(visible, anchor, index)` 单独导出并配单测，前向/后向/原地三种情况都覆盖。
  - `components/files/FileTable.tsx` 接管渲染：checkbox 列 + `role="row"` + `aria-selected` + `tabIndex={0}`；单击 `selectOnly`、双击 `onOpen`、Enter 打开、Space 切换（带 `event.shiftKey` 即连选）；checkbox 的 `onClick` 阻止冒泡，避免点复选框顺带触发整行选中。
  - `FileListSkeleton` 补了一列骨架，和新增的 checkbox 列对齐，加载态不会跳一下。
- [x] 6.2 抽出 `components/files/FileToolbar.tsx`：全选 + 刷新/新建文件夹/上传。
  - 实际文件名用 `FileToolbar.tsx`（与同目录 `FileTable.tsx`/`FilePreviewModal.tsx` 的 `File` 前缀一致），不是清单里写的 `Toolbar.tsx`。
  - 全选框用 `ref` 回调设置 `node.indeterminate = selection.someSelected`——`indeterminate` 是 DOM 属性、React 没有对应 prop，这是唯一正确写法。
  - 上传的 `<input type="file" multiple hidden>` 移进组件内部，选中后立刻 `event.target.value = ""`，否则连续上传同一个文件不会再触发 `change`。
  - `FilesPage.tsx` 因此删掉了 `uploadRef`（连同 `useRef` 导入）与页头那组按钮，选中态操作条（预览/重命名/删除）保留在页面里——它属于 6.5 的「底部操作条」，等 6.5 再挪。
  - **视图切换 / 排序** 两项控件随 6.3 / 6.4 一起补进同一个组件：先落组件骨架、再挂状态，比先塞两个占位按钮再回头改要干净。
- [x] 6.3 新增网格视图 `components/files/FileGrid.tsx` 与视图切换持久化（localStorage）。
  - `lib/preferences.ts` 统一收口持久化：单一 `edgelist:` 前缀、只存字符串、读写都包 try/catch（隐私模式 / 配额满 / Node 测试环境都不能把页面弄崩），并配 4 个单测覆盖「往返」「未写入回退」「无 storage」「旧值回退」。
  - `hooks/useStoredState.ts` 在 **render 期** 读取而不是在 effect 里读：在 effect 里读会先画一帧默认值再跳变，而且会踩 `set-state-in-effect`。`key` 变化时旧 override 自动失效——这是 6.4 按路径存排序要用的能力。
  - 视图切换按清单要求做成 **全局** 偏好（`edgelist:view-mode`），对齐 OpenList 的 `global_default_layout`。OpenList 还有第三个 `image` 布局，本版只做 `list`/`grid`，`parseViewMode` 把不认识的值（含 `image`）一律退回 `list`，避免读到旧值白屏。
  - 顺手删掉 3 处 `accent-[var(--accent)]`：`index.css` 已有 `input[type="checkbox"] { accent-color: var(--accent) }`，而元素选择器特异性高于工具类，这个类从来没生效过。
  - 网格瓦片复用了 `FileTable` 的交互契约（单击 `selectOnly`、双击打开、Space 切换、Enter 打开、Shift 连选），复选框在未选中时靠 hover / focus 才显形，避免瓦片被一排方框糊住。
  - 补 `components/files/file-views.test.tsx`：用 `react-dom/server` 的 `renderToStaticMarkup` 做渲染冒烟（列表行数、网格瓦片、选中态 `aria-selected`、工具栏 `aria-pressed` 与计数）。**不引入 jsdom / Testing Library** —— 零新依赖就能挡住「渲染直接崩」和「props 对不上」这两类问题，点击行为由 hook 层单测覆盖。`vitest.config.ts` 的 `include` 因此加上 `src/**/*.test.tsx`。
  - **未做浏览器验证**：本机 KV 里的存储指向 IBM COS 与坚果云，沙箱内不一定连得通，所以没有跑真实数据下的目视验收。真正的交互级 UI 测试需要 jsdom + Testing Library，建议作为一个独立步骤再评估。
- [x] 6.4 列表头点击排序（name/size/modified），排序偏好按路径持久化。
  - 排序是 **服务端** 做的（`fsList` 收 `order_by` / `order_direction`，见 `worker/sort.ts` 的 `applySort`：先 `sortObjects` 再 `extractFolder`）。前端只负责发参数和记住偏好，绝不本地重排——分页之后本地排只会把当前这一页排乱。
  - 偏好键 `edgelist:sort:<path>`，对齐 OpenList 的 `dir_sort_<path>`。值存成 `"name:asc"` 这种短字符串而不是 JSON：**原语** 才能安全地进依赖数组，否则每次 render 新解析出的对象会让 `load` 换身份、effect 无限重跑。
  - `nextSortState` 抽成纯函数并配单测：点当前列翻方向，点别的列一律从 `asc` 开始。
  - **拆开两个 effect**：一个只依赖 `initialPath` 负责「离开目录就清空搜索框」，另一个依赖 `[initialPath, load]` 负责取数。合成一个的话，改排序会顺手把用户刚敲进搜索框、还没提交的关键词清掉。
  - 排序键用 **URL 里的路径**（`initialPath`）而不是 `path` state：用 state 的话，导航后 `path` 还没更新完，effect 会因为 key 变化再取一次，等于每次进目录发两次请求。
  - 搜索态下 **表头不可排序**（传 `sort={undefined}`，退化成纯文本标签）：搜索结果由服务端按相关度给，点表头只重排当前这一页没有意义。这是有意的取舍，不是漏做。
  - 表头补齐 `role="columnheader"` + `aria-sort`，数据格补 `role="gridcell"`；emoji 列改成固定 `w-8` 居中，否则表头和数据行的列宽对不齐。
  - 顺带修 `FileListSkeleton`：加了与真实表头等宽的骨架行（否则出数据时会跳一下），并支持 `view="grid"` 时渲染瓦片骨架（原先在网格视图下会显示列表形状的骨架）。
- [x] 6.5 选中态底部操作条：重命名 / 删除 / 下载 / 复制链接 / 清空。
  - 新增 `components/files/SelectionBar.tsx`：`fixed bottom-4` 居中悬浮，对齐 OpenList 的 `Center` 工具条（`pos="fixed" bottom="$4"`）。没选中时返回 `null`，所以不会和列表上方的工具栏抢位置。
  - 用 **原生 `<button>`** 而不是 HeroUI 的 `Button`：这一条要的是 `title` 和 `disabled` 原样落到 DOM（灰掉的按钮得能解释为什么灰），HeroUI 的 `onPress`/`isDisabled` 抽象反而碍事。
  - 单目标动作只在单选时可用（重命名、复制链接），多选时禁用并给出 `title` 说明，而不是默默只对第一个生效。下载在选区里含目录时禁用——归档功能还没做，拒绝比下一个空文件清楚。
  - `download` 改成收 `FileItem[]` 串行下载（浏览器会限制并发 blob 下载，而且单个失败不该中断其余）；`copyLink` 走 `/api/fs/link`，把返回的相对 `/d...` 用 `new URL(url, location.origin)` 补成绝对地址再写剪贴板。
  - 顺带去掉原先内联在页面里的「Preview/Edit」按钮：双击本来就能打开/预览，操作条专注"动作"而不是"打开"。同时给页面根节点在选中时加 `pb-24`，否则悬浮条会永久盖住最后一行。
  - **复制 / 移动两个按钮放到 6.6 一起做**：它们必须先有对话框才能点，先在 6.5 塞两个占位按钮、到 6.6 再回头改，等于白写一遍。6.6 会给 `SelectionBar` 补上这两个 prop。
  - 补 5 个渲染冒烟用例（空选区不渲染、单选显示文件名、多选禁用单目标动作、含目录时禁用下载/复制链接、单选文件时全可用）。
- [x] 6.6 复制/移动对话框：目录选择树（复用 3.1 的 `/api/fs/dirs`）+ overwrite/skip_existing/merge；**跨存储时禁用并提示**（决策 3，消费 3.12 的错误码）。
  - `components/files/DirectoryTree.tsx`：**懒加载** 树，节点首次展开才请求自己的子目录（`fs/dirs` 带 `depth: 1`）。一次递归拉全树会在 Workers 上按目录数放大请求量，懒加载则是"用户点几层就几次请求"。对齐 OpenList 的 `FolderTree`（同样是每个节点展开时 `fsDirs`）。
  - `components/files/TransferDialog.tsx`：冲突策略三选一，互斥关系照抄 OpenList —— 勾 overwrite 会清掉 skip/merge，skip 与 merge 在 overwrite 或彼此开启时禁用；`merge` 在 move 下也禁用，因为后端只在 `kind === "copy"` 时用它，留着就是个无效开关。
  - 三种状态都留了出口：全不勾＝遇到重名直接拒绝（后端 `TARGET_EXISTS`）；**逐项失败** 会留在对话框里列表展示（`name: error (code)`），部分成功不会静默；整请求失败（`VIRTUAL_MOUNT`、`NOT_DIRECTORY` 等）走 toast。
  - 跨存储两道防线：前端用 `lib/transfer.ts` 的 `mountPathFor` 取源/目标各自的挂载点（**最长前缀**，且按 `/` 边界匹配，`/a` 不会误吃 `/a-b`），不同则按钮禁用并显示 `跨存储复制/移动不支持：/waynecos → /jianguoyun`；后端仍会返回 `CROSS_STORAGE_TRANSFER`，UI 把 `code` 一并显示出来。提示用中文是为了和后端 `fs-transfer.ts` 里那句 `跨存储复制/移动不支持` 完全一致——同一个限制不该有两种说法。
  - `SelectionBar` 补上 Copy/Move，并在选区跨多个目录时禁用（后端一次只收一个 `src_dir`，而搜索结果天然跨目录）。
  - **发现并修掉一个真 bug**：`GET /api/admin/storage/list` 返回的是 `{ content: [...] }` 而不是裸数组，我原先按裸数组写，`(storages ?? []).map` 会直接抛。是起本地 dev server 打真实接口时对出来的。
  - **端到端验收（真浏览器 + 真数据）**：起 `vite dev`，用本地 KV 里的凭据登录，对 IBM COS 上的 `/waynecos` 跑通 28 项检查——登录、14 行列表、表头三列、视图切换与 `localStorage` 持久化、刷新后仍是网格、按 Size 排序（同时校验 `localStorage` 键值、`aria-sort="descending"` 和请求体里真的带了 `order_by=size&order_direction=asc`）、多选出现操作条、目录禁用下载/复制链接、打开复制对话框、展开树拿到 `/waynecos` `/jianguoyun` `/jianguoyun-backup`、切到 `/jianguoyun` 后出现中文提示且提交按钮禁用。截图见 `/tmp/edgelist-grid.png` 与 `/tmp/edgelist-transfer.png`（顺带验证了中文目录名 `临时存储`/`文档`/`软件` 正常渲染）。
  - **没有写任何云端数据**：验收只走读取和被拒绝的路径（跨存储复制在写之前就返回），没往用户的 IBM COS / 坚果云里放过东西。
- [x] 6.7 右键菜单 `components/files/ContextMenu.tsx`，按 `mask`（1.1）禁用不可用项。
  - 先补了 1.1 掩码的前端镜像 `lib/mask.ts`：`ObjMask` / `OBJ_LOCKED` / `OBJ_READ_ONLY` 常量照抄 `worker/storage/types.ts`，再加一个 **`permissionsFor(items)`** —— 它是这一步真正的核心。
  - `permissionsFor` 返回 `Record<ActionName, { allowed, reason }>`，把"这个选区能不能做这件事、不能的话为什么"收成一个地方。**操作条、右键菜单、表格共用它**，所以同一个动作不可能在一处可用、在另一处变灰。`reason` 直接当 `title` 用：灰掉却不解释等于死路。
  - 掩码位由服务端给（rename→`NoRename`、remove→`NoRemove`、copy→`NoCopy`、move→`NoMove`），但有 **三条规则是前端自己的**：① 挂载点不带 `NoCopy`（`OBJ_LOCKED` 只有 NoRename|NoRemove|NoMove），可 transfer planner 又会以 `VIRTUAL_MOUNT` 拒绝，所以必须显式看 `Virtual`；② move 会删原件，因此 `NoRemove` 也拦 move；③ 重命名只允许单选。
  - 顺带把 `parentOf` 抽到 `lib/paths.ts`（`groupByParent` 原先内联了同样的逻辑），并加 `crumbsOf` 供 6.10 用。
  - `ContextMenu` 是**通用组件**（只吃 `MenuItem[]` + 坐标），文件语义的菜单内容在 `lib/fileActions.ts` 的 `fileActions(permissions, handlers)` 里，纯函数、可单测。菜单几何（`menuPosition`）也在 `lib/menu.ts`：宽度固定 + 高度封顶，所以不用测量就能夹在视口内；`MenuItem` 类型也只留一份（顺手删掉了 `FileTable` 里重复的 `MenuRequest`）。
  - 关闭方式：全屏透明 backdrop 吃掉下一次点击（右键也算，所以连点右键是"移动菜单"而不是叠菜单），`Escape` 走 document 监听。
  - 右键一个**不在**当前选区里的条目时，先把它变成选区再弹菜单——文件管理器的惯例，菜单描述的永远是用户点的那个东西。
  - 新增 `lib/mask.test.ts`（17 例，含挂载点/中间层/`NoCopy` 与 `NoMove` 相互独立/`NoRemove` 单独拦 move/跨目录选区/`isMountLayer`）与 `ContextMenu.test.tsx`（8 例，含 `menuPosition` 夹取与 disabled+title 落到 DOM）。
  - **端到端验收**：根目录三个挂载点 `mask=15`（`Virtual|NoRename|NoRemove|NoMove`），真浏览器 24 项检查全绿——右键弹出菜单、七项齐全、挂载点上只有 Open 可用且每一项都带正确的 `title`、操作条与菜单结论一致、`Escape` 与点击外部都能关闭、普通目录的重命名/复制/删除仍可用、从菜单点 Copy 能打开传输对话框。截图 `/tmp/edgelist-menu-mount.png`。
  - 注意一个 **`Move` 的提示语**：挂载点上显示的是 `Mounted storages cannot be transferred` 而不是 `This item cannot be moved`，因为 `Virtual` 检查排在 `NoMove` 之前。两条都成立，前者对挂载点更准确，是有意如此。
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
- [x] `App.tsx` 只剩路由壳；`pnpm lint` 无超长行报错。
- [x] `pnpm test` / `pnpm lint` / `pnpm build` 全绿。

## Commit 约定

每个步骤使用一个清晰的本地 commit，例如：

```text
feat: add ObjMask to file objects
fix: select storage by mount depth
test: cover nested mount resolution
refactor: split App.tsx into pages
```
