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
- [x] 6.8 拖放上传（含目录递归），替换单文件 `<input type="file">`。
  - 新增 `lib/dropUpload.ts`：`droppedTree(dataTransfer)` 走拖放（`items[].webkitGetAsEntry()` → 递归 `FileSystemEntry`），`pickedTree(fileList)` 走 `<input>`（`webkitRelativePath`），两者都产出同一个 `DroppedTree { files, directories }`，所以上传路径只有一条。
  - **`readEntries` 必须循环到空数组**：Chrome 单次最多返回 100 项，只读一次会静默丢掉目录里其余的条目。`readAllEntries` 在回调里再次发起读取（`readEntries` 不允许并发调用），并配了「5 个子项、每次只回 2 个」的单测把这个循环钉死。
  - 文件保留 **相对路径**（`{ file, path }`）而不是把路径拼进 `file.name`（OpenList 的做法）。名字仍是真的名字，报错信息引用的才是用户认识的那个文件名。
  - `traverseEntry` 连**空目录**一起记录，所以拖进来的目录树形状能保住；`directoriesOf` 则从文件路径反推目录，供目录选择器使用（选择器只给文件，看不到空目录——这是浏览器 API 的限制）。
  - `directoriesToCreate` 按深度排序、去重。**不用 `create_parent`**：那个标志是向上递归，而 S3 的 `mkdir` 会写一个 0 字节的目录标记对象，`create_parent` 会从挂载根一路写上去，在用户桶里留下垃圾对象。改成「父目录先于子目录」逐个创建，就只碰上传目录以下。
  - **为什么要 mkdir**：`fsPut` 直接透传到适配器，S3 的 key 天然扁平所以不需要目录，但 **WebDAV 的 `write` 是裸 PUT**，父集合不存在会失败。本机三个挂载点里 `/jianguoyun`、`/jianguoyun-backup` 正是 webdav，所以这一步是必需的，不是保险。
  - mkdir 的失败 **有意吞掉**：重复拖同一个目录时「已存在」是常态，而紧随其后的 PUT 才是权威判据——目录真建不出来时，上传会逐文件报错。这样既不用在客户端字符串匹配各家驱动的错误文案，也不会把「已存在」当成错误弹给用户。
  - `components/files/DropZone.tsx`：`dragenter`/`dragleave` 会随指针经过每个子元素反复触发，所以用 **计数器** 而不是布尔值驱动浮层（布尔值一进子行就闪掉）。浮层加 `pointer-events-none`，否则它自己会制造 `dragleave` 把自己关掉。另挂一对 **window 级** `dragover`/`drop` 拦截：落在区域外的投放本来会让浏览器直接导航到那个文件，把用户正在做的页面丢掉。
  - `FileToolbar` 拆成两个隐藏输入（普通多选 + `webkitdirectory` 目录选择），并把上传进度 `Uploading n/m` 用 `role="status"` 报出来，批次进行中锁住按钮——顺序上传几十个文件时页面不能看起来像卡死。`webkitdirectory` 不在 React 的 JSX 类型里，用 `Record<string, string>` 展开传入。
  - `FilesPage.upload` 改收 `DroppedTree`，成功后顺手清掉搜索态：上传会让当前搜索结果过期，继续显示「Search: xxx」但列出目录内容是自相矛盾的。
  - 新增 `lib/dropUpload.test.ts`（18 例）与 `file-views.test.tsx` 的 2 例（两个选择器并存、进度与 `role="status"`）。合计 **212 例 / 18 文件**。
  - **端到端验收（真浏览器 + 真数据）25 项全绿**：登录 → 进 `/waynecos` → 工具栏两个上传入口与两个隐藏输入（目录选择器带 `webkitdirectory` 且不可见）→ 合成 `DataTransfer` 拖入时浮层出现、**一次 `dragleave` 不会提前关闭**（验证计数器）、离开后消失 → 区域外投放被 `preventDefault`（`defaultPrevented === true`）→ **目录选择器** 用 `setInputFiles('/tmp/edgelist-pick')` 真实走通：3 个 mkdir 按 `edgelist-pick > docs > docs/sub` 父先子后、3 个 PUT 分别落在 `edgelist-pick/notes.txt`、`.../docs/a.md`、`.../docs/sub/b.md`、`File-Path` 与 `Content-Type` 都正确、所有 mkdir 都在 PUT 之前 → 平铺拖放 1 个文件落在当前目录且不建目录。截图 `/tmp/edgelist-drop.png`。
  - **没往云端写任何东西**：验收在浏览器侧拦截了 `/api/fs/mkdir`、`/api/fs/put`、`/api/fs/form`，请求根本不出进程；跑完再用真实接口列一次 `/waynecos`，13 个条目与验收前一致、没有 `edgelist-pick` / `dropped.txt` 残留。
  - **顺带确认一个浏览器语义**：目录选择器给的 `webkitRelativePath` **包含被选中目录自身的名字**（选 `edgelist-pick` 得到 `edgelist-pick/docs/a.md`）。第一版断言写成了不含这一层，是断言错了不是代码错了——这也说明拖放/选择目录会真的建出那一层目录，符合文件管理器惯例。
  - **踩到一个并行编辑的坑**：同一文件的两处 `Edit` 放在同一条消息里并发执行，只有一处落地（`FilesPage.tsx` 的 `dropUpload` 导入丢失，报 `TS2304`）。之后改为串行逐处编辑。
- [x] 6.9 分页/加载更多 `components/files/Pager.tsx`（替换硬编码 `per_page: 200`）。
  - **决策 a（本地偏好，暂不接服务端设置）**：KV 里的 `pagination_type` / `default_page_size` 目前**没有任何公开 API 可读**（设置只被备份/恢复用到），所以这一步把页大小与翻页模式做成前端偏好：`edgelist:page-size`（`50/100/200/500/all`）与 `edgelist:page-mode`（`pagination` / `load_more`）。默认 `200` 就是原先硬编码的值，没碰过这个控件的人行为完全不变。等阶段八做站点设置时再把 `pagination_type` 接上。
  - `lib/pagination.ts` 只放纯算术（`pageCount` / `pageRange` / `pageNumbers` / `clampPage` / `perPageFor`），组件只负责画，所以窗口化页码、边界夹取这些最容易写错的地方都能脱离 DOM 单测。`lib/preferences.ts` 按既有约定继续收口持久化（key + parse/serialize）。
  - **`per_page: 0` 在两个端点含义不同**：`fsList` 走 `paginateFileObjects`，`<= 0` 就是「全都要」；而 `fsSearch` 是 `Math.max(1, input.per_page ?? 100)`，**`0` 会被夹成 1**。所以「全部」在列表里发 `0`，在搜索里必须发一个大数（`SEARCH_ALL = 10000`）。这是服务端的既有不一致，前端用 `perPageFor(size, endpoint)` 收口并写明原因；没去改 worker 是因为 `fsSearch` 没有单测（需要 KV 绑定），改一处没有测试覆盖的分支不划算——留作后端一致性清理的候选。
  - 翻页模式：`pagination` 换页（`aria-current="page"` 标记当前页，首/末页常驻、中间折叠成 `…`），`load_more` 追加（`Showing 200 of 342` + `Show more` 按钮，加载中禁用）。**模式开关与动作按钮不能同名**：一开始两者都叫 `Load more`，同一行出现两个同名按钮，视觉和断言都分不清，动作按钮改成 `Show more`。
  - 分页对**目录列表和搜索结果同样生效**（`fs/search` 本来就收 `page`/`per_page` 并返回 `total`），两个入口收在 `goToPage` / `loadMore` 两个小函数后面。
  - 删掉最后一页的最后一条会把人留在一个空页上，所以 `removeSelected` 用 `clampPage(page, total - targets.length, pageSize)` 回退一页；没有把「回退」写进 `load` 自己（`useCallback` 里自引用会让 `load` 依赖自己 → 每次 render 换身份 → effect 死循环）。
  - 顺手修一个真 bug：`parsePageSize` 原先接受任意正数，而选择器只提供 5 个档位——存了 `"5"` 就会出现「下拉显示 50、实际按 5 请求」的错位。现在只接受选择器里有的档位，其余一律回落默认值，**显示与请求永远一致**。
  - 增删文件后 `load(path, page)` 保留当前页（建目录/重命名/删除/上传/传输/刷新都如此），只有换目录、换排序、换页大小、换模式才回到第 1 页。
  - 新增 `lib/pagination.test.ts`（22 例）、`preferences.test.ts` 补 6 例、`file-views.test.tsx` 补 9 例。合计 **247 例 / 19 文件**；`tsc -b` / `eslint .` / `prettier --check` / `vite build` 全绿。
  - **端到端验收 32 项全绿**（真浏览器）：真数据下确认默认发 `per_page=200`、切 50 发 `per_page=50` 并回到第 1 页、切 `All` 发 `per_page=0`、偏好写进 `localStorage`（`"all"` 存成词而不是 0）、刷新后仍生效且下拉显示一致、13 条时只有「13 items」不出现页码；再用**拦截 `/api/fs/list` 返回 342 条的合成响应**把翻页走穿——`1–100 of 342`、首屏 100 行、点页码发 `page=2` 且 `per_page=100` 不变、第二页替换第一页、`aria-current` 跟随、返回第 1 页后 `Previous` 禁用、切到 `load_more` 回到第 1 页、`Show more` 发 `page=2` 且行数 100 → 200（真追加）、模式写进 `localStorage`；搜索同样带上 `per_page`/`page`。截图 `/tmp/edgelist-pager.png`。
  - **没有写任何云端数据**：全程只读（列表、搜索），写端点未触碰。
- [x] 6.10 面包屑支持路径直接编辑跳转。
  - 新增 `components/files/PathBar.tsx`：平时是面包屑（`Root` + 各级 crumb），点右侧 ✎（或 `aria-label="Edit path"`）整条变成文本框，预填当前完整路径。Enter 跳转、Escape 取消、**点击别处也取消**——取消是安全的默认，误触不会把人带到别的地方。
  - 文本框是**非受控**的（`defaultValue` 只给初值，之后归用户）：受控的话每次按键都要 re-render，还会和光标位置打架。`draft` 一个 state 同时当「编辑器开没开」和「正在输入什么」，没有草稿就没有编辑器。
  - 新增 `lib/paths.ts` 的 `normalizeInputPath`：补前导斜杠、去尾斜杠、折叠重复斜杠、去空白，并**在客户端解析 `.` 与 `..`**。之所以在这里解析而不是透传给后端：`fs/list` 没有理由理解 `..`，一个真叫 `..` 的目录名会被当成目录名去查。只做词法解析——文本框无从知道存储里到底有什么。`/../..` 不会越出根。
  - 顺手修一个被 6.10 放大的老问题：`load` 原先把 `setPath` 放在请求成功之后，所以**请求失败时面包屑会停留在上一个目录**，和地址栏互相矛盾。现在 `setPath` / `setPage` 无论成败都跟着请求走，并且失败时清空 `items` / `total`——否则「新的面包屑 + 旧目录的条目」会被读成「这个目录里有这些文件」。
  - **验收发现一个真实行为差异（值得记住）**：在 **对象存储**（`/waynecos`，S3）上，一个不存在的路径**不是错误**，而是一个空列表——对象存储没有目录的概念，前缀下没有 key 就是没有。所以输入 `/waynecos/definitely-not-here` 得到的是「No files found」而不是报错。真正会报错的是**不在任何挂载点下**的路径（`/not-a-mount` → `Storage not found`，HTTP 400）。第一版断言把前者当成了错误路径，是断言错了。
  - 新增 `lib/paths.test.ts`（14 例，含 `parentOf` / `crumbsOf` / `normalizeInputPath` 的中文目录名、`..` 越界、只含点的目录名 `..b`），`file-views.test.tsx` 补 3 例。合计 **263 例 / 20 文件**；`tsc -b` / `eslint .` / `prettier --check` / `vite build` 全绿。
  - **端到端验收 25 项全绿**（真浏览器）：面包屑可编辑、预填当前路径、Escape 取消且不跳转、点别处取消且不跳转、`waynecos/media`（无前导斜杠）→ 请求体 `/waynecos/media`、`/waynecos/nas/../sql/` → 请求体 `/waynecos/sql`、`/` 可达且面包屑折叠、不存在的前缀显示「No files found」且面包屑与地址栏一致、`/not-a-mount` 显示 `Storage not found`、失败后仍可继续编辑并能恢复。截图 `/tmp/edgelist-path-edit.png`。
  - **没有写任何云端数据**：全程只读。
- [x] 6.11 按 `mask` 隐藏挂载点/只读项的重命名、移动、删除入口（与 6.7 共用掩码常量）。
  - **范围修正**：清单原文说的"挂载点/只读项的入口"在 6.7 就已交付——`permissionsFor` 是唯一判据，操作条、右键菜单、表格共用它，挂载点（`mask=15`）只剩 Open 可用。本步做的是它**漏掉的那一半**：选区级别的入口挡住了，但**当前目录本身**能不能写从来没判过。在根目录 `/` 点 New folder / Upload 必然失败（`selectStorage` 只匹配祖先挂载，根不是存储），却一路发出请求拿回英文 `Storage not found`。
  - 新增 `lib/transfer.ts` 的 `unwritableHint(path, mounts)`：挂载列表为 `null`（还没拿到 / 读失败）时**一律放行**——"读失败"和"什么都没挂载"是两个答案，按后者处理会在一次网络抖动后把所有写按钮灰掉。拿到列表后用 `mountPathFor` 判断该路径有没有存储服务。
  - **`isMountLayer` 终于被用上**（6.7 加了却一直没人调用）。但它**只改文案、不改判定**：中间层（只为到达嵌套挂载而存在的目录）如果还被父存储服务着，`fsMkdir` 会解析到父存储并成功，所以不能禁——禁了就是客户端拒绝一个服务端会接受的操作。文案从"No storage is mounted at /a"改成"only exists to reach a nested mount"，因为列表里明明能看到这个目录，说"没有挂载存储"是自相矛盾的。根目录单独排除：它是所有挂载的前缀，`isMountLayer("/")` 恒为真。
  - `FileToolbar` 收一个 `writeHint`，New folder / Upload folder / Upload 三个一起锁（它们失败的原因完全相同），**Refresh 不锁**——读一个不能写的目录完全合理。上传浮层（`DropZone`）同时禁用，否则拖拽会弹出一个承诺了却会被拒的提示。
  - **不给 HeroUI `Button` 传 `title`**：它的 props 类型不接受，而且禁用元素在浏览器里根本不触发 hover，tooltip 永远看不到。所以理由以 `data-testid="write-hint"` 的可见文本呈现——禁掉却不解释等于死路。
  - `TransferDialog` 收一个 `mounts` prop，把三条例外收进 `destinationHint(srcDir, destination, mounts)`：目标是源目录本身、目标是源目录的子目录（按 `/` 边界判，`/a/docs2` 不会误判为 `/a/docs` 的子目录）、跨存储、目标没有存储服务。全部在**发请求之前**给出理由并禁用提交，而不是让用户选完再失败。
  - 补 `transfer.test.ts` 12 例（`unwritableHint` 5 / `destinationHint` 7）、`file-views.test.tsx` 2 例（锁定态显示理由且恰好 3 个按钮禁用、可写时不显示）。合计 **277 例 / 20 文件**；`tsc -b` / `eslint .` / `prettier --check` / `vite build` 全绿。
  - **端到端验收 19 项全绿**（真浏览器 + 真数据）：登录后落在 `/` → 出现理由文本且文案为 `No storage is mounted at /` → 三个写入按钮全部禁用、Refresh 仍可用 → 进 `/waynecos` 后理由消失、按钮恢复 → 勾选两个目录打开复制对话框 → 默认目标＝源目录且提交禁用、理由为 `Pick a folder other than the one being transferred from` → 树展开 Root 拿到三个挂载点 → 切到 `/jianguoyun` 出现 `跨存储复制/移动不支持` 且提交禁用。截图 `/tmp/edgelist-write-guard-root.png`、`/tmp/edgelist-write-guard-transfer.png`。
  - **没有写任何云端数据**：全程只读，脚本另挂 request 监听证明 `/api/fs/{mkdir,put,form,copy,move,remove,rename,multipart}` 一次都没发出。
  - **仍未做**：Meta 规则或 `NoWrite` 掩码导致的不可写只有服务端知道（返回 403），前端拿不到，所以这两条不在提示范围内。

> ✅ **阶段六已完成**（11/11）。文件列表从"能用"做到"好用"：多选 / 网格 / 列头排序 / 悬浮操作条 /
> 复制移动对话框 / 右键菜单 / 拖放上传 / 分页 / 面包屑编辑 / 写入口守卫。全部逻辑收在
> `lib/{mask,transfer,paths,preferences,pagination,dropUpload}.ts` 这些纯函数里，组件只负责画。

## 阶段七：存储管理（磁盘管理器）

- [x] 7.1 存储列表改为表格：`mount_path / driver / order / status / remark / 操作`，支持 driver 筛选。
  - 新增 `components/storage/StorageTable.tsx`（表格 + `StorageTableSkeleton` 骨架）与 `StoragesPage.tsx` 作控制器。列头用 `role="columnheader"`、数据格 `role="cell"`，和 `FileTable` 一套约定。
  - **筛选只列"真的用上了"的驱动**：从当前列表反推用到的 driver key，再和 registry 取交集。给一个没人挂载的驱动画 chip，等于给用户一个背后什么都没有的控件。chip 少于 2 个时整组不渲染（只有一个驱动时筛选没有意义）。空结果和"一条存储都没有"分成两种文案。
  - 顺手把这一页从 `text-slate-400`/`bg-blue-50` 这批硬编码颜色改成主题变量（`text-muted`/`bg-accent-soft`），它是全项目最后一处没跟上主题的地方。
- [x] 7.2 接启用/禁用操作（后端已有 `storageEnable/storageDisable`）。
  - 两个端点是 **POST + query 参数**（`?id=N`），不是 JSON body——先 curl 确认过再写的前端，这是 6.6 那次 `{content:[...]}` 教训的延续。
  - 切换期间该行三个按钮一起禁用（`busyId`），避免连点发出两次相反的请求。禁用中的行状态点变灰、文案 `Disabled`。
- [x] 7.3 接"重载全部"（`storage/load_all`）与刷新按钮。
  - 两个按钮分工明确：`Refresh` 只重取本地列表，`Reload all` 让 Worker 重读 KV 配置后再取。
- [x] 7.4 新增 `components/storage/DriverField.tsx`：按 `Item.type` 渲染 string/number/bool/text/select。
  - 只有"每种类型长什么样"在这一个组件里，`StorageFields` 只负责把 items 摆出来。
  - number 输入框在 `onChange` 就转成 number：`<input type="number">` 交出来的仍是字符串，不转就会把 `"4"` 写进 addition，而 OpenList 那边期待的是数字。
- [x] 7.5 重写 `components/storage/StorageForm.tsx`：拉 `/api/admin/driver/list` 动态渲染公共项 + 驱动项，删除硬编码字段。
  - 拆成两个组件：`StorageFields.tsx` 是字段本体（无弹窗），`StorageForm.tsx` 只是套一层 Modal 加保存按钮。**拆的理由是可测**：HeroUI 的 Modal 走 portal，`renderToStaticMarkup` 拿到的是空字符串，字段抽出来才能做渲染冒烟。
  - 字段标签由 `humanize(item.name)` 从字段名推出来（`secret_access_key` → "Secret Access Key"），**不建标签表**——标签表正是这一步要消灭的硬编码，新驱动会因为没人记得加一行而显示成 `some_new_key`。
  - 删掉 `StorageEditor.tsx` / `StorageField.tsx` / `StorageToggle.tsx` / `WebdavFields.tsx` 与 `lib/storage.ts`（`readS3Form` / `storageForEditor` 随之作废）。
  - **语言变化**：旧的存储表单是中文，现在跟应用其余部分一致改成英文。i18n 是 8.8 的事，在那之前不该只有一页是中文。
  - **顺带发现 8 个假字段（阶段零漏网的）**：registry 里 S3 声明了 16 个 item，其中 `custom_host`、`enable_custom_host_presign`、`sign_url_expire`、`placeholder`、`remove_bucket`、`add_filename_to_disposition`、`enable_direct_upload`、`direct_upload_host` **在 `s3.ts` 里一次都没被读过**（全仓库 grep 确认）。它们从 OpenList 抄来时就带着，旧表单里也一样是死的——`remove_bucket` 当初甚至被标成 `disabled` 摆在那里。步骤 0.3 只清了代理/缓存/签名那批，漏了这 8 个。按阶段零的同一条原则**从 registry 移除**；`normalizeStorageConfig` 保留未知键，所以备份仍然双向无损。
  - 并且**加了守卫**：`registry.test.ts` 用 `?raw` 把三个适配器的源码读进来，断言每个声明的 item 名字都能在**自己那个适配器**里找到，找不到就带着名字失败。已实测这个守卫会咬人（临时塞一个假 item 进去，报 `webdav declares "..." but its adapter never reads it`）。用 `?raw` 而不是 `node:fs` 是因为 worker 的 tsconfig 故意不引 Node 类型——`src/worker` 里不该能随手拿到 Workers 运行时没有的 API。
- [x] 7.6 表单支持切换驱动时重置 addition 并按 `Item.default` 回填。
  - `withDriver` **整体替换**而不是合并 addition：留着 S3 的 key 而 driver 已经写着 WebDAV，会让表单显示一堆不属于它的字段，还会把这些陈旧值存回去。
  - 新建时直接切（没有东西可丢）；**编辑已有存储时先确认**——静默清空凭证是不可逆的。取消则驱动不变。
  - `defaultAddition` 只收非空的 `default`：给每个可选字段写一个 `""` 会让记录里堆满无意义的键，然后一路进备份。
- [x] 7.7 表单支持 `required` 校验、`help` 提示、`options` 下拉。
  - `required` 直接落到原生属性，浏览器负责拦截并提示，不自己写一套校验状态机；`help` 渲染在控件下方；`select` 用 `item.options.split(",")`。
- [x] 7.8 存储删除改为二次确认弹窗（替换 `confirm()`，复用 5.4）。
  - **已在 5.3/5.4 顺手完成**：`StoragesPage` 早就用的是 `useConfirm()`（Promise 形式），本次没有改动，只补了验收。
- [x] 7.9 表单支持 JSON 导入/导出 addition（对齐 OpenList）。
  - **对齐的是 OpenList 的真实行为，不是清单原文**：OpenList 导入导出的是**整条存储记录**（`JSON.stringify(storage)`），不是只有 `addition`。所以这里也搬整条——`addition` 只是其中一个字段，整条更有用（可以把一个挂载在实例之间复制）。导入时丢弃 `id`/`status`/`disabled`/`modified` 四个服务端字段，和 OpenList 丢的完全一致。
  - 顺带接受 `addition` 是**对象**的输入（有些导出是这样），统一成 API 存的那种字符串。
  - 导出对话框明写"这份 JSON 含存储凭证"——OpenList 不提示，但把密码摊在屏幕上不说一声不合适。
- [x] 7.10 前端按新增/编辑分别调 `/create` 与 `/update`（配合 3.11）。
  - `editing.id > 0 ? "/update" : "/create"`。**3.11 的 `/update` 会校验 `id > 0`**，所以新增时错发到 `/update` 不是"碰巧能用"，而是 400。
  - 实测新增的请求体是 `{"mount_path":"/imported","driver":"webdav","addition":"{...}"}`——**连 `id` 键都没有**，而不是 `id:0`。`JSON.stringify` 会丢掉 `undefined`，Worker 那边 `input.id || max+1` 照样给新 id，这条路径是对的。

> ✅ **阶段七已完成**（10/10）。存储页从"能增删改"变成磁盘管理器：表格 + 状态 + 筛选 + 启用禁用 + 重载，
> 表单完全由 registry 驱动，加一个驱动不用改前端一行。
>
> **验证**：新增 `lib/drivers.test.ts`（28 例）与 `components/storage/storage-views.test.tsx`（12 例，
> `StorageTable` 4 + `StorageFields` 8），另加 registry 的"声明必须被读到"守卫。合计 **320 例 / 22 文件**；
> `tsc -b` / `eslint .` / `prettier --check src` / `vite build` 全绿。
>
> **端到端验收 45 项全绿**（真浏览器 + 真数据）：表格六列齐全、3 行、驱动徽章与状态正确 → 筛选 S3 收敛到 1 行、
> Clear 恢复 3 行 → Reload all 打到 `storage/load_all` → 新建对话框按 registry 出字段（含 select 下拉、
> password 遮罩、required 标记、help 文案）→ 切到 WebDav 字段整体换掉、切回来还原 → 导出 JSON 含
> `mount_path`/`driver` 且提示含凭证、Escape 可关 → 粘贴一条带 `id:99`/`status:disabled` 的记录导入后
> 挂载路径与驱动都生效 → 保存走 `/create`（请求体里连 `id` 键都没有）→ 编辑保存走 `/update`（带 id）→
> 编辑态切驱动先弹确认、取消后驱动不变 → 禁用后该行显示 `Disabled`、再启用恢复 `Enabled`（**跑完已还原**）
> → 删除弹的是 ConfirmDialog 而不是 `window.confirm`，取消后存储还在。截图
> `/tmp/edgelist-storages-{table,json,import,disabled,delete}.png`。
>
> **没有写任何云端数据**：`/create` 与 `/update` 两个端点在浏览器侧被 `page.route` 拦截并 `fulfill`，
> 请求不出进程；启用/禁用只改**本地 dev KV**（miniflare）里的 `disabled` 标志，且跑完立刻切回原状态。

## 阶段八：增强（预览 / 缓存 / 上传）

- [x] 8.1 抽出预览分派器 `components/files/preview/index.tsx`，按扩展名选择预览器。
  - **按扩展名，不按 MIME**：列表里根本没有媒体类型——S3 与 WebDAV 都把 `Content-Type` 留空，worker 只是透传驱动给的值。要按 MIME 分派就得先下载一遍才知道该用哪个预览器，所以扩展名是唯一不花钱的判据。为此补了 `extensionOf()`：旧的 `name.split(".").pop()` 会把一个叫 `png` 的文件当成图片、把 `json` 送进 JSON 编辑器。
  - 纯逻辑抽在 `lib/preview.ts`（无 DOM，可测），`index.tsx` 只管渲染与分发；删掉了旧的 `FilePreviewModal.tsx`。
  - **`svg` 归到图片**：文件管理器就该把 SVG 显示成图，XML 只是"用编辑器打开"一步之遥。
  - **Monaco 改成懒加载**（`React.lazy` + 动态 `import()`）：入口包 **8,100,278 → 467,387 字节（−94%）**，Monaco 被隔离进 7.6 MB 的 `TextViewer` 分块，只在第一次打开文本时加载。这同时让分派器能在 Node 里被 `renderToStaticMarkup` 渲染（`preview-views.test.tsx` 的 11 例就是这么跑的）。
  - 顺带修掉一个**真 bug**：`app.on(["GET","HEAD"], "/d/*")` 在 Hono 4 里 `c.req.param("*")` 是 `null`，路径塌成 `/`，于是**每一次下载、以及 `/api/fs/link` 发出去的每一个 URL 都 404 "Storage not found"**。通配符必须具名：`/d/:name{.*}`。新增 `download-route.test.ts`（3 例），并**反向验证过这个守卫会咬人**（临时改回旧写法 → 1 例失败，改回来即通过）。
  - 又修一个只在 dev 出现的坑：`@typefox/monaco-editor-react` 把 React 声明成**普通依赖**而不是 peer，pnpm 于是在它下面装了一份 React 19.2.8（应用是 19.2.1），Vite 的依赖预打包把这份内联进去，打开任何文本文件就 `Invalid hook call`。生产构建是干净的（Rollup 会去重），只有 dev server 会重复。用 `resolve.dedupe: ["react","react-dom"]` 修掉。
- [x] 8.2 图片预览、视频/音频预览。
  - `/d/*` 是**要鉴权头的**，所以 `<img src="/d/...">` 永远拿不到字节——浏览器不会给子资源带 `Authorization`。三者都走 `fetchFileResponse()` 取字节，再转成 object URL。
  - `withMime()` 只在驱动**没说话**时补媒体类型：驱动答 `application/octet-stream` 时 `<video>` 拒绝播放，而驱动真的知道类型时（S3 对象上的 `Content-Type`）它是更好的权威，就不覆盖。
  - 视频给了 codec 提示（浏览器对 `.mkv`/`.mov` 的容器支持并不一致）。
  - **object URL 的释放绑在 URL 本身**：`useEffect(..., [previewUrl])` 返回的清理函数 revoke 它，这样无论预览以哪种方式结束都会释放。
  - **16 MB 缓冲上限**（`BLOB_SIZE_LIMIT`，从 64 MB 调低）：`URL.createObjectURL(await response.blob())` 是"整份文件进内存才显示第一个像素"，`preload="metadata"` 救不了——blob 到元素手上时已经是完整的。实测真实桶里 51 MB 的录音半分钟还没出来。**这一步下载功能还不可用**，所以超限的文件不再退回下载，而是打开一块说明面板（`toolarge`），**一个字节都不取**。
- [x] 8.3 PDF / Office / markdown 预览。
  - **PDF** 把 object URL 交给 `<iframe>`，用浏览器自带的阅读器。
  - **Office 说清为什么不能看**：`.doc/.xls/.ppt` 是旧二进制格式，连 OOXML 三件套也需要一个比整个前端还大的渲染器，所以给一块面板明说"没有浏览器内预览"，而不是悄悄失败。分派器对 `office` **直接短路，不发任何请求**。
  - **markdown 自带渲染器**（`lib/markdown.ts`，零依赖）：先转义再加标签，所以 `dangerouslySetInnerHTML` 拿到的永远是自己写的标记；链接走允许名单（`/`、`#`、`http(s):`、`mailto:`）。打开是**渲染态**，可切到 Source 复用 Monaco（模式开关放进编辑器工具栏的 `leading` 槽位，避免出现两个 Save）。
  - 渲染器踩到一个真坑：`inline()` 递归时共用一个全局正则，内层调用重置了 `lastIndex`，外层从同一个匹配重新开始，输出无限增长 → `RangeError: Invalid string length`。改成递归前先把匹配物化到 `new RegExp(source, "g")` 的副本上。
  - 另一个：`[click](javascript:alert(1))` 只渲染出 `click)`，因为 href 停在第一个 `)`。改成允许一层配对括号 `((?:[^()\s]|\([^()]*\))+)`，顺带也修好了维基那种带括号的真实链接。
- [ ] 8.4 README 渲染（header/readme/footer 三个 md）。
- [ ] 8.5 目录缓存实现（决策 1 闭环）：用 `caches.default` 按 `mount_path + path` 缓存列表，TTL 取 `cache_expiration`，`refresh` 绕过；**恢复 0.2 移除的字段**。
- [ ] 8.6 前端分片上传接入 `/api/fs/multipart/*`；非 S3 驱动时降级并提示上限。
- [ ] 8.7 前端上传体积上限提示与失败重试。
- [ ] 8.8 i18n 骨架（中/英），与 OpenList 文案风格对齐。

> 🚧 **阶段八进行中**：8.1–8.3 已完成（预览分派器 + 各预览器），8.4–8.8 未开始。
>
> **验证**：新增 `lib/preview.test.ts`（21 例）、`lib/markdown.test.ts`（23 例）、
> `components/files/preview/preview-views.test.tsx`（11 例）、`worker/download-route.test.ts`（3 例）。
> 合计 **383 例 / 26 文件**；`tsc -b` / `eslint .` / `prettier --check src` / `vite build` 全绿。
>
> **端到端验收 38 项全绿**（真浏览器 + 真数据）：登录后列表渲染时 Monaco 一次都没被请求（`monaco requests=0`），
> 列表也没取任何文件字节 → 打开 `文档/Athena.md` 是**渲染态**（`<h1>Athena</h1>`、真正的 `<ol>` 3 项、链接是真 `<a>`、
> 正文里没有残留的 `## `、Monaco 仍未加载）→ 切到 Source 才加载 Monaco（121 个请求）、一个 Save 且初始 disabled →
> 打开 `worldlink.yaml` 编辑器带 `YAML · 7.8 KB` 说明，输入后标题出现 `*`、Save 变可用，保存**只发一个 PUT**
> （`%2Fwaynecos%2Fworldlink.yaml`，8000 字节），保存后 `*` 消失 → `logo/Bash.svg` 以 `blob:` 打开且
> `naturalWidth > 0`（真的解码了）、没有编辑器、有 Download → `media/confront2_缩混.m4a` 的 `<audio>` 从 `blob:` 播放、
> `duration=0.25`（读到了元数据）、没有 codec 提示 → `media/division.mp4`（127.7 MB）打开的是**说明面板而不是播放器**，
> 且**一个字节都没取**（`before=4 after=4`）→ 注入的 `quarterly-report.docx` 同样是说明面板 + Download、**不取字节** →
> 我们自己创建的 object URL 2 个全部释放（`created=2 revoked=2`），Monaco 为 worker 自留的 2 个不计入。
> 截图 `/tmp/edgelist-preview-{markdown,source,image,audio,toolarge,office}.png`。
>
> **没有写任何云端数据**：唯一的写请求（保存）被 `page.route` 拦下并本地应答（"1 attempted, 1 answered locally"）。
>
> **两处环境注记**（都不是代码问题）：① 验收期间 `/waynecos`（S3 挂载）出现过一次 12 秒停顿，`networkidle` 因此超时，
> 脚本改用 `domcontentloaded` + 显式等行；② 媒体字节用本地生成的 WAV 代替、列表里 `.m4a` 的大小被改写成 1.5 MB，
> 因为真实文件 51 MB / 128 MB 超过缓冲上限、走的就是 `toolarge` 分支——那正是要测的行为之一。
>
> **构建注记**：`vite build` 在本回合被沙箱的批量删除守卫拦下（Vite 清空自己 gitignored 的 `dist/` 时超阈值），
> 于是临时用 `emptyOutDir: false` 跑了一次（跑完已还原），产物正常：入口 **467.59 kB**、Monaco 隔离在
> `TextViewer-DKm8sPs3.js`（7.6 MB）。

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
- [x] 表单里不再存在"能改但不生效"的字段（假字段清理完成）。
  - 阶段零清掉 6 个，阶段七 7.5 又清掉 8 个（S3 的 `custom_host` 等，见 7.5），并加了守卫测试。
- [ ] `extract_folder` 改名后，旧备份导入、新备份导出到 OpenList 均正确。
  - 迁移本身有单测覆盖（0.7），但**没有真的拿 OpenList 跑过一次导入/导出往返**，所以这条先不勾。
- [ ] 挂载点目录在列表中可识别为磁盘，重命名/删除/移动入口被正确禁用。
  - 入口禁用已由 6.7/6.11 完成并验收；"可识别为磁盘"还差一个视觉标识（文件列表里挂载点仍是 📁），未做。
- [x] 嵌套挂载 `/a` + `/a/b` 可正确路由，禁用 `/a/b` 后回退到 `/a`。
  - `selectStorage` 的单测覆盖：嵌套、前缀误匹配（`/ab` vs `/a`）、disabled 回退外层（`config.test.ts`）。
- [x] 文件列表支持按名称（自然序）/大小/时间排序，目录前置。
  - 1.8/1.9/1.10 的服务端排序 + 6.4 的表头 UI，单测与真浏览器验收都覆盖了。
- [x] 存储表单由 `/api/admin/driver/list` 驱动，新增驱动不需要改前端。
  - 阶段二就绪，阶段七 7.5 接上。字段、类型、默认值、选项、必填、help 全部来自 registry；
    7.4 的 `DriverField` 只决定每种类型长什么样。
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
