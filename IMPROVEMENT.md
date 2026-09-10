# EdgeList 优化与重构分析

本文对照 OpenList 后端（`/Users/zero/IdeaProjects/OpenList`）与前端（`/Users/zero/IdeaProjects/OpenList-Frontend`），
梳理 EdgeList 当前实现在**挂载模型**、**文件管理器能力**、**存储管理（磁盘管理器）能力**上的差距，
并给出每一项的改造方案。执行步骤见 [`TODOLIST.md`](./TODOLIST.md)。

> 定位重申：EdgeList 应该首先是**一个磁盘/存储管理器**（挂载、驱动、状态、排序、代理策略），
> 其次才是**一个文件管理器**（浏览、多选、批量操作、预览、上传下载）。
> 当前实现的两个身份都不完整：后端只有"路径 → 适配器"的最小映射，前端只有一个单文件列表页。

---

## 0. 已拍板的决策

| # | 议题 | 决策 | 落地位置 |
| --- | --- | --- | --- |
| 1 | 目录缓存 | **先移除字段，阶段八再实现**。备份层仍透传原值，保证双向迁移无损 | 步骤 0.2、8.5 |
| 2 | `folder_order` 命名 | **改名为 `extract_folder`**，值 `before/after` → `front/back`，读写双向迁移 | 步骤 0.3 |
| 3 | 跨存储复制/移动 | **明确禁止**，后端统一错误码，UI 明确提示 | 步骤 3.12、6.6 |
| 4 | 前端路由 | **引入 react-router**，路径对齐 OpenList `/`、`/@login`、`/@manage/*` | 步骤 5.1 |
| 5 | 前端代码组织 | **禁止把所有逻辑堆进 `App.tsx`**，强制按页面/组件拆分并限制行宽 | 步骤 5.2、5.3 |

---

## 1. Workers 平台约束（不可照搬 OpenList 的部分）

OpenList 是有状态、无时长限制、有本地磁盘的 Go 程序。搬到 Workers 上必须放弃或改造以下设计，
这是后面若干决策的根因：

| 约束 | 影响 | EdgeList 的取舍 |
| --- | --- | --- |
| **请求体上限**（约 100MB，且受内存约束） | 不能把大文件整体读入再转发出去 | 必须支持 `/api/fs/form` 与 multipart 分片 |
| **CPU 时间上限**（单次请求毫秒级~数十秒） | 无界目录遍历、大目录递归必然超时 | `fsSearch` 必须有深度/数量上限；递归操作改为分批 |
| **无长驻内存** | `singleflight`、dirCache、`validTokenCache` 都无处安放 | 缓存改用 `caches.default`；令牌失效改用 KV 黑名单 |
| **无后台常驻任务** | OpenList 的 `task` 框架（上传/复制/离线下载）无法复刻 | 跨存储复制/移动**明确禁止**（决策 3） |
| **KV 最终一致** | 存储配置写入后读可能滞后 | 存储写操作后需容忍短暂不一致，UI 提示刷新 |
| **无 WebSocket / 长连接** | 任务进度推送不可行 | 长操作改为客户端轮询或一次性同步返回 |

---

## 2. 现状速览

| 层 | 文件 | 行数 | 问题 |
| --- | --- | --- | --- |
| Worker 路由 | `src/worker/index.ts` | 41 | 只注册了约 22 条路由，缺 driver/setting/link/dirs/batch 等 |
| 挂载解析 | `src/worker/storage/config.ts` | 106 | 只支持"直接子挂载"枚举，无 mask、无排序、无嵌套语义 |
| 路径路由 | `src/worker/storage/factory.ts` | 35 | 最长前缀匹配靠字符串长度排序，disabled 挂载会误伤父挂载 |
| 适配器接口 | `src/worker/storage/types.ts` | 79 | 无统一能力声明、无 `mask`、无驱动配置项 |
| 文件 API | `src/worker/fs.ts` | 161 | 缺 dirs/batch/link/recursive_move/remove_empty_directory |
| 传输 | `src/worker/fs-transfer.ts` | 146 | 只支持同存储，无跨存储、无异步任务 |
| 前端 | `src/react-app/App.tsx` | 168（超长行） | 全部页面、逻辑、表单硬编码在一个文件 |
| 前端路由 | `src/react-app/routes.ts` | 17 | 手工 `history` 管理，仅 4 个路由 |

OpenList 后端对应能力散落在 `internal/op/{storage,path,fs,driver,meta}.go`、`internal/model/{storage,obj}.go`、
`server/handles/*`、`internal/driver/{driver,config,item}.go`；前端在 `src/pages/home/**`、`src/pages/manage/**`。

---

## 3. 差距总表

| # | 主题 | 优先级 | 现状 | 目标（OpenList 行为） |
| --- | --- | --- | --- | --- |
| A1 | 挂载树与虚拟目录生成 | **P0** | 只枚举直接子挂载，无层级语义 | 最长前缀匹配 + 虚拟目录分"真实挂载点 / 中间层"两种 |
| A2 | 挂载解析健壮性 | **P0** | 字符串长度排序、disabled 直接抛错 | 按层级深度匹配 + 跳过 disabled |
| A3 | `ObjMask` 权限掩码 | **P0** | 无 | 虚拟/只读/锁定，驱动 UI 与后端校验共用 |
| B1 | 列表排序 | **P0** | 无排序（返回上游原序） | `order_by` + 自然序 + `extract_folder` |
| B2 | 文件对象字段 | P1 | 只有 name/size/is_dir/modified/created/path | 补 `mask`/`hashinfo`/`provider` |
| C1 | 驱动能力声明 | **P0** | 三个适配器各写 `new Set([...])`，无差异 | 集中 `DriverConfig` 声明 |
| C2 | 驱动配置项（driver items） | **P0** | 无，前端硬编码表单 | `/api/admin/driver/list` 返回 items，前端动态渲染 |
| C3 | 假字段清理 | **P0** | 6 个字段前端可改、后端从不读取 | 实现 或 从 UI 移除，禁止"假功能" |
| D1 | API 覆盖度 | P1 | 22 条 | 补 dirs/link/form/multipart/remove_empty_directory |
| D2 | 分片上传 | P1 | 只有单次 PUT | 请求体上限约束下必须支持（仅 S3 驱动） |
| E1 | 存储管理列表 | P1 | 只显示驱动 + 备注 | order/status 列、启用禁用、筛选 |
| E2 | 存储表单 | **P0** | S3/WebDAV 字段硬编码在 App.tsx | 由 driver items 驱动的动态表单 |
| F1 | 文件浏览页 | **P0** | 单选、单列表视图、无右键、无拖放、无排序 UI | 多选/框选、list+grid、右键菜单、拖放、列头排序 |
| F2 | 批量与跨目录操作 | P1 | 后端有 API，前端未接 | 复制/移动/删除对话框 + 目录选择树 |
| F3 | 预览器 | P2 | 只有 Monaco 文本 | 图片/视频/音频/PDF/Office/markdown 分派 |
| G1 | 目录缓存 | P2 | 字段存在但从未使用 | **先移除字段**（决策 1），阶段八用 `caches.default` 实现 |
| H1 | Meta ACL 接入 | P1 | 只有 CRUD，未接入 `fs/*` | `GetNearestMeta` + 读写/密码/隐藏判定 |
| H2 | 用户模型 | P2 | 单 AK/SK、token 无法失效 | `role`/`permission`、logout 失效 |
| I1 | 工程结构与可读性 | **P0** | App.tsx 单文件 + 超长行 | 按页面/组件拆分 + 行宽规则（决策 5） |

---

## 4. 详细分析

### A. 挂载与虚拟目录模型（最核心）

#### A1 虚拟目录缺少层级语义

**现状**（`src/worker/storage/config.ts:16-39` `listVirtualMounts`）：

```ts
const relative = mount.slice(prefix.length);
const name = relative.split("/")[0];      // 只取第一段
children.set(name, { name, size: 0, is_dir: true, ... });
```

它把所有在 `parent` 之下的挂载压平成"直接子目录"，且**不区分**这个虚拟目录是：

- **真实挂载点**（如 `/nas`，本身 mount 了一个存储）→ OpenList 用 `Mask = Locked | Virtual`（可下钻，但不可改名/删除/移动）
- **中间层**（如 `/data` 下有 `/data/nas`，但 `/data` 本身不是挂载点）→ OpenList 用 `Mask = ReadOnly | Virtual`（纯占位，不可写）

参考 `internal/op/storage.go:378-443` `getStorageVirtualFilesByPath`：按 `Order` 再按 `MountPath` 排序，
`Cut` 出第一段作为 name，`set[name]` 去重；`!found`（无剩余段）时标记为挂载点根。

**后果**：前端无法判断一个虚拟目录能否操作。现在对 `/nas` 点"重命名"会一路走到后端
抛 `"A storage mount cannot be overwritten"`，体验很差。

**方案**：引入 `ObjMask`（见 A3），`listVirtualMounts` 输出时区分两种掩码，前端据此禁用入口。

#### A2 挂载解析健壮性

**现状**（`src/worker/storage/factory.ts:16-27` `resolveStorage`）：

```ts
.sort((a, b) => normalizePath(b.mount_path).length - normalizePath(a.mount_path).length)[0];
if (!config || config.disabled) throw new Error("Storage not found");
```

两个问题：

1. **按字符串长度而非层级深度排序**。多数场景碰巧等价，但本质是未定义行为。
   OpenList `internal/op/storage.go:314-338` 用 `strings.Count(PathAddSeparatorSuffix(mountPath), "/")` 取段数。
2. **disabled 挂载会阻塞父挂载**。若 `/nas` 被禁用，解析 `/nas/foo` 会取到 disabled 的 `/nas`
   然后直接抛错，而不是回退到 `/`（root storage）。正确行为是禁用后该挂载不参与匹配。

**方案**：抽出 `selectStorage(configs, path)` 纯函数：先过滤 `!disabled`，按段数降序取最深。
配套单测覆盖：root 挂载、一级挂载、嵌套挂载、禁用回退、前缀误匹配（`/ab` vs `/a`）。

> **不做的部分**：OpenList 的 `.balance` 负载均衡（`storage.go:448-464`，同路径 `xxx` / `xxx.balance` 轮询）
> 依赖长驻内存的 `balanceMap`，在无状态 Workers 上无法正确工作。**明确排除**，但保留
> `GetActualMountPath` 去掉 `.balance` 后缀的兼容逻辑，避免未来冲突。

#### A3 `ObjMask` 缺失

沿用 OpenList `internal/model/obj.go:239-257` 的位定义：

```
Virtual=1  NoRename=2  NoRemove=4  NoMove=8  NoCopy=16  NoWrite=32
Locked    = NoRename | NoRemove | NoMove
ReadOnly  = Locked | NoWrite
```

这是"磁盘管理器"语义的基础：挂载点在文件列表里应该被识别为**磁盘**，而不是普通文件夹。
`mask` 同时被后端写操作校验（阶段四 4.5）和前端 UI 禁用（阶段六 6.7、6.11）消费，两边共用同一份常量。

---

### B. 文件列表与排序

#### B1 完全没有排序（体验差距最大的一项）

**现状**：`fsList` 把 `adapter.list()` 的结果原样返回，没有任何排序。
`StorageConfig` 里的 `order_by`/`order_direction`/`folder_order` 前端能改、备份会存，
但后端**从未读取**——这是个"假功能"。

**OpenList 行为**（`internal/model/obj.go:86-133`、`internal/op/fs.go:67-70`）：

1. `SortFiles(objs, orderBy, orderDirection)`：`name` 用**自然序**（`natural.Less`，`file-2` 排在 `file-10` 前）；
   `size` 比大小；`modified` 比时间。
2. `ExtractFolder(objs, extractFolder)`：稳定排序把目录推到 `front` 或 `back`。
   注意 **OpenList 无论 `LocalSort` 与否都执行 `ExtractFolder`**。
3. 虚拟目录自身排序：`Order` 升序，同序按 `MountPath`（`storage.go:381-386`）。

**方案**：
- 新增 `src/worker/sort.ts`：`compareNatural`（数字分段比较）、`sortObjects(items, orderBy, orderDirection)`、`extractFolder(items, position)`。
- `fsList` 在合并虚拟目录**之后**、分页**之前**应用：先 `sortObjects`，再 `extractFolder`。
- 排序来源优先级：请求参数 `order_by/order_direction` > 命中的 storage 配置 > 全局默认。
- `order_by` 合法值统一为 OpenList 的 `name / size / modified`（当前前端多了一个 `created`，需移除）。

**前置依赖**：`extract_folder` 改名（决策 2）必须先于本项完成，否则排序读的是旧字段名。

#### B2 文件对象字段不全

`internal/model/obj.go:22-34` + `object.go:22-32`：`ID / Path / Name / Size / Modified / Ctime / IsFolder / HashInfo / Mask`。
当前 `FileObject` 只有 6 个字段加一个从未被填充的 `hashinfo`。建议补齐：

| 字段 | 说明 | 来源 |
| --- | --- | --- |
| `mask` | 权限掩码（A3） | 虚拟目录 / 驱动只读 |
| `hashinfo` | `{ md5, sha1, sha256 }` 子集 | S3 ETag、WebDAV `getetag`、OpenList 上游 |
| `provider` | 驱动展示名 | `config.driver` |

> **S3 ETag 陷阱**：分片上传产生的 ETag 形如 `"etag-N"`，不是 MD5。填充 `hashinfo.md5` 时必须
> 排除带 `-` 后缀的情况，否则校验值错误。

**暂不做**：`sign`（签名直链，依赖 `internal/sign`）、`thumb`（缩略图）、`raw_url`。
`enable_sign` 字段按 C3 从 UI 移除或标注。

---

### C. 驱动能力、配置项与假字段

#### C1 能力声明分散且无差异

**现状**：三个适配器各自 `readonly capabilities = new Set([...])`，`openlist` 声明了全部 8 项
（含 `merge`），`webdav` 7 项。已核实 `openlist` 确实把 `merge` 传给了上游 `/api/fs/copy`，声明属实。
真正的问题是**能力声明与驱动元数据分离**：适配器自己说自己能干什么，无法表达
`internal/driver/config.go:3-29` 的 `NoUpload / NoLinkURL / OnlyProxy / NoCache / LocalSort / CheckStatus`
等语义，也无法被管理端 UI 查询（`canUpload?`、`needsProxy?`）。

Go 用"可选接口 + 类型断言"探测能力；TS 里应改成**集中式的注册表**，适配器只负责实现，
能力由注册表给出。

**方案**：新增 `src/worker/storage/registry.ts`：

```ts
interface DriverDefinition {
  name: string;                 // "OpenList" / "S3" / "WebDav"
  key: StorageDriver;           // "openlist" / "object" / "webdav"
  config: DriverConfig;         // localSort / noCache / noUpload / onlyProxy / noLinkUrl ...
  items: DriverItems;           // { common: Item[]; additional: Item[] }
  create(config: StorageConfig): StorageAdapter;
  checkStatus?(config): Promise<boolean>;
}
```

#### C2 驱动配置项（driver items）——存储管理表单的基础

**现状**：`src/react-app/App.tsx` 的 `StorageEditor` 把 S3 的十几个字段、WebDAV 的字段
**硬编码**在 JSX 里（约 3 个巨型 `<section>`），OpenList 驱动的 addition 甚至退化成一个
`<textarea>` 让用户手写 JSON。每加一个驱动就要改 UI；没有 `required` 校验、`default` 回填、
`options` 下拉、`help` 提示。

**OpenList 行为**：
- `internal/driver/item.go:7-14`：`Item{Name, Type, Default, Options, Required, Help}`。
- `internal/op/driver.go:46-216` `getMainItems()` 硬编码公共项；`getAdditionalItems()` 反射 `Addition` 结构体 tag。
- 前端 `src/pages/manage/storages/AddOrEdit.tsx` 拉 `/admin/driver/list`，
  `storages/Item.tsx` 按 `Type` 渲染：String→Input、Number→number、Bool→Switch、Text→Textarea、Select→下拉；
  切换 driver 时清空并用 `GetDefaultValue` 回填。

**方案**：Worker 新增 driver 三件套端点；`registry.ts` 为每个驱动显式声明 `additional: Item[]`；
前端重写为通用 `DriverForm`，删除全部硬编码字段。

#### C3 假字段清理（新增，P0）

以下字段当前**前端可编辑、备份会写入、但后端从不读取**，属于"假功能"：

| 字段 | 现状 | 处理（决策 1 扩展） |
| --- | --- | --- |
| `cache_expiration` | 从未使用 | UI 移除，备份层**透传保留**，阶段八实现后恢复 |
| `custom_cache_policies` | 从未使用 | 同上 |
| `disable_index` | 表单里 `disabled` 不可改 | UI 移除（无索引功能） |
| `enable_sign` | 未实现签名 | UI 移除（或标注为未实现） |
| `down_proxy_url` | 未实现代理下载 | 已确认未实现，UI 移除 |
| `web_proxy` / `disable_proxy_sign` | 未实现 | 已确认未实现，UI 移除 |
| `webdav_policy` | **已确认 `/d/*` 恒为代理流式转发，从不 302** | UI 移除；值域仍需统一为 OpenList 三值 |
| `order_by` 的 `created` 选项 | OpenList 无此值 | 移除，统一为 `name/size/modified` |
| `refresh` 请求参数 | 无缓存可刷新 | 保留参数（客户端兼容），文档标注为 no-op |

**原则**：表单里展示的每一项必须真的生效，或者被诚实标注/移除。"磁盘管理器"的可信度就在这里。

**备份透传策略**（关键）：`normalizeStorageConfig` 目前是 spread 保留未知字段，
所以"从 UI 移除"≠"从数据里删除"。导入 OpenList 备份时这些字段仍然保留在 KV 中，
导出时原样带出，**双向迁移无损**。

---

### D. API 覆盖度

对照 `server/router.go:70-251`，EdgeList 缺以下高价值端点：

| 端点 | 用途 | 优先级 |
| --- | --- | --- |
| `GET /api/admin/driver/list` `names` `info` | 动态存储表单 | **P0** |
| `POST /api/fs/dirs` | 目录树，供复制/移动目标选择 | **P0** |
| `POST /api/fs/link` | 取直链 | P1 |
| `POST /api/fs/remove_empty_directory` | 递归清理空目录 | P1 |
| `PUT /api/fs/form` | 表单上传 | P1 |
| `POST /api/fs/multipart/*` | 分片上传（**仅 S3 驱动**） | P1 |
| `POST /api/admin/storage/list` 分页 | 存储变多后必需 | P2 |
| `POST /api/fs/batch_rename`、`regex_rename`、`recursive_move` | 批量操作 | P2 |

其他细节：

- **上传体积**：Workers 请求体有上限。当前 `fsPut` 把 `c.req.raw` 整体透传给 S3 `PUT`，大文件必然失败。
  分片上传**只对 S3 驱动可行**（有 `CompleteMultipartUpload`）；WebDAV/OpenList 驱动没有原生的服务端分片组合能力，
  降级为"超过阈值直接拒绝 + 前端提示"。
- **下载恒为代理，有带宽与体积代价**（已确认）：`/d/*` 走 `adapter.read()` 把上游响应原样返回，
  即**所有字节都经过 Workers**。这既消耗 Workers 出口带宽，也受请求体/响应体上限约束。
  OpenList 默认策略是 302 重定向到直链。建议后续用 `/api/fs/link` + 302 作为 S3 驱动的默认路径，
  这同时也让 `webdav_policy` 字段重新变得有意义。
- **`fsRemove` 串行**：`for` 循环逐个删除，慢且中途失败无回滚。应并发 + 逐项返回结果。
- **`fsMkdir` 不递归**：OpenList `MakeDir`（`internal/op/fs.go:305`）会递归建父目录。
- **`fsSearch` 无界 BFS**：`visited.size < 1000` 的深度遍历在 CPU 限制下必然超时。需加深度 + 目录数上限。
- **下载缺 `Content-Disposition`**：`/d/*` 未设置文件名，需补 RFC 5987 编码。
- **跨存储传输（决策 3）**：`fs-transfer.ts:106` 已抛 `"Cross-storage transfer is not supported"`，
  但需要**统一错误码与错误消息**，让前端能识别并给出确定性提示，而不是显示后端英文原文。
- **create/update 语义混淆**：前端 `StoragesView.save` 无论新增还是编辑都 POST 到 `/api/admin/storage/create`。
  后端 `storageSave` 恰好能同时处理所以能工作，但语义错误。应：新增调 `/create`，编辑调 `/update`，
  且 `/update` 校验 `id > 0`。

---

### E. 存储管理（磁盘管理器）

#### E1 列表页

OpenList `src/pages/manage/storages/Storages.tsx` 的列：
`mount_path / driver / order / usage(Progress) / status / remark / operations`，
支持 grid/table 双布局、driver 多选筛选、刷新/新增/重载全部，
行操作含编辑、启用/禁用、删除二次确认。

当前 EdgeList 列表只渲染 `driver` 徽章 + `mount_path` + `remark` + Edit/Delete：

- 没有 `order`、`status` 展示
- **没有启用/禁用**（后端 `storageEnable/storageDisable` 已实现，前端未接）
- 没有"重载全部"、没有 driver 筛选
- 点 `mount_path` 跳到文件页的交互不错，保留

#### E2 表单

见 C2 + C3。这是整个存储管理体验的关键。

---

### F. 前端文件管理器

当前 `FilesView`（`App.tsx:40-83`）的能力清单 vs OpenList `src/pages/home/folder/`：

| 能力 | EdgeList | OpenList |
| --- | --- | --- |
| 列表视图 | ✅ 单一 | ✅ List / Grid / Images 三视图 |
| 多选 | ❌ 单选 `selected` | ✅ 框选（`@viselect/vanilla`）+ Shift 连选 |
| 右键菜单 | ❌ | ✅ `solid-contextmenu` |
| 列头排序 | ❌ | ✅ 排序态存 `localStorage["dir_sort_<path>"]` |
| 拖放上传 | ❌ | ✅ `uploads/Upload.tsx` + `traverseFileTree` |
| 复制/移动 | ❌ 后端有 API，前端未接 | ✅ 带 overwrite/skip_existing/merge |
| 批量删除 | ❌ | ✅ |
| 分页/加载更多 | ❌（一次性 200 条） | ✅ `Pager.tsx` |
| 预览 | 仅 Monaco 文本 | ✅ 图片/视频/音频/PDF/Office/归档/URL |
| 路径输入 | 仅面包屑 | 面包屑 + Ctrl/Cmd+K 搜索弹窗 |
| 侧边目录树 | ❌ | ✅ 悬浮 `FolderTree` |

---

### G. 目录缓存

`cache_expiration`（默认 30 分钟）与 `custom_cache_policies`（`pattern:ttl`）在前端表单里能改，
但 Worker 侧没有任何缓存实现——又一个"假功能"。OpenList 的 `op.List` 走 `singleflight` + dirCache TTL
（`internal/op/fs.go:26`、`internal/op/cache.go`），依赖长驻内存，Workers 上无法直接复刻。

**决策 1：先移除字段，阶段八再实现。** 落地方式：

1. 从 `StorageConfig` 类型与前端表单移除这两个字段（与 C3 的假字段清理一并做）。
2. **备份层透传保留**——`normalizeStorageConfig` 是 spread 保留未知字段，所以导入 OpenList 备份时
   这些值仍留在 KV，导出时原样带出，**双向迁移无损**。这一点很关键：
   "从 UI 移除"不等于"从数据删除"，否则导出的备份会让 OpenList 丢掉缓存配置。
3. `fs/list` 的 `refresh` 参数保留（客户端兼容），文档标注为 no-op。
4. 阶段八改用 `caches.default` 按 `mount_path + path` 缓存列表，TTL 取 `cache_expiration`，恢复字段。

> 注意 `refresh` 与缓存的顺序关系：`refresh: true` 必须绕过缓存直接请求上游，否则无法强制刷新。
> 另外缓存 key 必须包含命中的 `mount_path`，否则嵌套挂载下不同存储会互相污染。

---

### H. 认证与权限（Meta ACL 与用户模型）

- **Meta ACL 未接入**：`internal/op/meta.go:22-37` `GetNearestMeta` 沿父目录向上找最近规则，
  `server/common/check.go` 的 `CanRead/CanWrite/CanAccess` 做判定（含 `hide` 正则、密码、`*_sub` 子目录开关）。
  EdgeList 的 `metas` 只有 CRUD，对 `fs/*` 完全无影响。
  **前置**：`src/worker/meta.ts` 的 `MetaConfig` 只有 11 行，缺 `hide`/`h_sub`/`readme`/`header`
  等字段，需先对齐 `internal/model/meta.go:3-20`。
- **用户模型**：`/api/me`（`auth.ts:101-104`）硬编码 `{ is_admin: true, disabled: false }`，
  无 `role`/`permission`/`base_path`（`internal/model/user.go:40-72`）。
- **logout 无效**：`logout` 直接返回 success，token 仍在有效期内可用。
  OpenList 用 `validTokenCache` + `IsTokenInvalidated`；Workers 上改用 KV 令牌黑名单。
- **匿名只读**：OpenList 的 `/api/fs/list`、`/api/fs/get` 在 guest 未禁用时可匿名访问。
  EdgeList 对所有 `/api/fs/*` 强制 `requireAuth`。**保持强制登录**（私有部署更安全），
  暂不引入 guest 模式。

---

### I. 工程结构与可读性（决策 5）

**现状**：`App.tsx` 168 行，但每行极长（最长单行超过 3000 字符），承载了路由、鉴权、文件浏览、
存储表单、元数据表单、备份页、预览、上传、下载、toast。**人类不可读、不可维护**。

**目标结构**：

```
src/react-app/
  main.tsx
  router.tsx                    # react-router 路由表
  api.ts                        # 统一请求层 + 401 处理
  types.ts                      # 与 worker 共享的类型
  hooks/useAuth.ts
  pages/FilesPage.tsx
  pages/StoragesPage.tsx
  pages/MetadataPage.tsx
  pages/BackupPage.tsx
  pages/LoginPage.tsx
  components/files/FileList.tsx
  components/files/FileGrid.tsx
  components/files/Breadcrumb.tsx
  components/files/Toolbar.tsx
  components/files/ContextMenu.tsx
  components/files/Pager.tsx
  components/files/preview/
  components/storage/StorageForm.tsx
  components/storage/DriverField.tsx
  components/common/Modal.tsx / ConfirmDialog.tsx
```

**配套强制规则**（否则会退化回去）：

1. 加 Prettier 配置 `printWidth: 120`（或 ESLint `max-len`），纳入 lint。
2. 单个组件文件不超过约 200 行；超出即拆分。
3. 一个文件只导出一个主要组件；类型与工具函数单独成文件。
4. 禁止在 JSX 里内联超过 3 行的逻辑；复杂逻辑提到 `function` 或 hook。
5. `pnpm lint` 必须能通过，作为提交前置条件。

---

## 5. 明确排除的范围

以下 OpenList 能力**不在本次重构范围内**，在文档中标注清楚，避免误判为遗漏：

| 能力 | 原因 |
| --- | --- |
| WebDAV / S3 / FTP / SFTP **服务端**（`server/webdav.go` 等） | 需要长连接与有状态会话 |
| 离线下载（aria2/qBittorrent） | 需要后台常驻任务 |
| 分享链接 `/s/*`、`/api/share/*` | 需要用户与分享表，当前单用户模型 |
| 全文搜索索引（`internal/search`） | 需要索引存储与后台构建 |
| 归档解压（`internal/archive`） | 需要本地磁盘暂存 |
| `.balance` 负载均衡 | 依赖长驻内存的轮询状态 |
| 签名直链 `/p/*` 与 `enable_sign` | 依赖 `internal/sign` |
| 站点设置 `/api/admin/setting/*` | 备份结构里保留空数组即可 |
| 多用户管理 `/api/admin/user/*` | 单 AK/SK 模型 |
| i18n 完整语言包 | 仅做骨架 |

---

## 6. 参考对照表

| OpenList 后端 | OpenList 前端 | EdgeList 对应/待建 |
| --- | --- | --- |
| `internal/model/storage.go` | — | `src/worker/storage/types.ts` |
| `internal/model/obj.go`（Sort/Extract/Mask） | — | `src/worker/sort.ts`（待建） |
| `internal/op/storage.go`（虚拟目录） | — | `src/worker/storage/config.ts:listVirtualMounts` |
| `internal/op/path.go`（最长匹配） | — | `src/worker/storage/factory.ts:resolveStorage` |
| `internal/driver/{driver,config,item}.go` | — | `src/worker/storage/registry.ts`（待建） |
| `internal/op/driver.go`（getMainItems） | `pages/manage/storages/AddOrEdit.tsx` | `components/storage/DriverField.tsx`（待建） |
| `server/handles/fsread.go` | `pages/home/folder/*` | `pages/FilesPage.tsx`（待拆） |
| `server/handles/storagemanage.go` | `pages/manage/storages/Storages.tsx` | `pages/StoragesPage.tsx`（待拆） |
| `internal/op/meta.go` + `server/common/check.go` | — | `src/worker/fs.ts`（待接入） |
| `server/router.go` | `src/app/App.tsx` | `src/worker/index.ts` + `src/react-app/router.tsx` |

---

## 7. 实施顺序与依赖

```
阶段零 数据模型对齐 ──> 阶段一 基础模型 ──> 阶段二 驱动注册表 ──> 阶段三 API 补齐
   (决策1/2)              (mask/挂载/排序)      (依赖0.3改名)         |
                                                                     v
阶段五 前端结构 <── 阶段四 Meta ACL <────────────────────────────────┘
 (决策4/5)          (依赖 mask)
   |
   +--> 阶段六 文件管理器交互 (依赖 3.1 dirs、3.12 跨存储错误码)
   +--> 阶段七 存储管理 (依赖 2.5 driver/list)
   +--> 阶段八 增强 (8.5 缓存恢复字段，闭环决策 1)
```

**关键依赖说明**：

- **阶段零必须先做**：`extract_folder` 改名（0.3）是阶段一排序（1.10）的前置；
  假字段清理（0.2）决定阶段二 items 生成（2.4）包含哪些字段。
  顺序反了会导致返工。
- **阶段四依赖阶段一的 `mask`**：写操作掩码校验需要 mask 已就位。
- **阶段六依赖阶段三的 `/api/fs/dirs`**：目录选择树要用到。
- **阶段七依赖阶段二的 driver items**：动态表单的数据源。
- **阶段五（前端结构）建议排在阶段四之后**：后端字段稳定后再拆前端，避免拆完又改。
