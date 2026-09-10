# OpenList 兼容性范围

本文档基于本地参考版本：

- 后端：`/Users/zero/IdeaProjects/OpenList`
- 前端：`/Users/zero/IdeaProjects/OpenList-Frontend`

## 通用响应

所有 JSON API 使用如下 envelope：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

分页数据放在 `data` 中，形状为 `{ "content": [], "total": 0 }`。

`fs/list` 会先合并当前目录的真实文件和直接子挂载生成的虚拟目录；同名项以真实文件为准。当底层存储列表失败但仍存在可用的子挂载时，返回可用的虚拟挂载并保留部分成功语义。

## 认证

- `POST /api/auth/login`：兼容旧客户端，密码按 SHA-256 静态摘要处理。
- `POST /api/auth/login/hash`：请求体为 `{ "username": string, "password": string, "otp_code"?: string }`，密码已经由客户端摘要。
- 登录成功返回 `{ "token": string }`。
- 后续请求使用 `Authorization: <token>`，不附加 `Bearer ` 前缀。
- `GET /api/me` 返回当前用户；`GET /api/auth/logout` 注销令牌。
- EdgeList 的登录凭据不是 OpenList 用户表：登录页面使用 AK/SK，Worker 通过 KV 读取配置并在服务端校验，兼容层仍返回 OpenList 形式的 token。

## 文件与元信息 API

第一阶段实现并保持 OpenList 请求字段及响应字段：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/fs/list` | 分页列目录，字段 `path/password/page/per_page/refresh` |
| POST | `/api/fs/get` | 获取文件或目录元信息，字段 `path/password` |
| POST | `/api/fs/mkdir` | 创建目录，字段 `path` |
| POST | `/api/fs/rename` | 重命名，字段 `path/name/overwrite` |
| POST | `/api/fs/remove` | 删除，字段 `dir/names` |
| POST | `/api/fs/search` | 搜索，保持 OpenList 搜索请求字段 |
| PUT | `/api/fs/put` | 流式上传；路径通过 `File-Path` 请求头传递 |
| POST | `/api/admin/meta/list` | 元信息分页列表 |
| POST | `/api/admin/meta/create` | 创建元信息规则 |
| POST | `/api/admin/meta/update` | 更新元信息规则 |
| POST | `/api/admin/meta/delete` | 删除元信息规则 |

存储管理 API 保留 `/api/admin/storage/list|get|create|update|delete|enable|disable`，仅允许 `openlist`、对象存储和 `webdav` 三类适配器。

创建和更新存储时会校验 `addition` JSON 以及当前驱动的必需字段；`enable`、`disable` 和 `load_all` 会同步刷新状态字段。Worker 不保存长生命周期驱动实例，`load_all` 主要保持客户端兼容。

文件对象至少包含 OpenList 前端依赖的 `name`、`size`、`is_dir`、`modified`、`created`、`path`、`hashinfo` 等元信息字段；具体驱动差异通过适配器隐藏。

## 排序与缓存

- `fs/list` 的 `refresh` 字段保留以兼容 OpenList 客户端，但目前没有目录缓存实现，因此它是 no-op：请求总是直接打到上游存储。
- 排序配置使用 OpenList 命名：`order_by` 取值为 `name`、`size`、`modified`；`extract_folder` 取值为 `front`、`back`。
  早期版本使用的 `folder_order`（`before`、`after`）在读取时自动迁移为 `extract_folder`。

## 已移除的管理界面字段

以下字段后端从未读取，已从存储表单移除，避免"能改但不生效"：

`cache_expiration`、`custom_cache_policies`、`web_proxy`、`webdav_policy`、`down_proxy_url`、`disable_proxy_sign`、`disable_index`、`enable_sign`。

备份导入导出仍然原样透传这些字段（存储配置保留未知键），因此从 OpenList 导入的配置不会丢数据，导出后也能被 OpenList 还原。

## 存储适配器

Worker 内部统一抽象为 list、stat、read、write、mkdir、remove、rename；路由挂载路径后将逻辑路径转换为驱动路径。

- `openlist`：调用上游 OpenList 的 `/api/fs/*` API，并转发必要的文件流。
- `object`：使用标准 S3 REST API 和 Signature V4；Cloudflare R2 也可以通过其 S3 兼容 endpoint 接入，但不依赖 R2 原生绑定。
- `webdav`：使用 Fetch 实现 PROPFIND、GET、PUT、MKCOL、DELETE、MOVE。

## 备份与还原

OpenList 前端备份文件是 JSON，顶层字段为：

```json
{
  "encrypted": "",
  "settings": [],
  "users": [],
  "storages": [],
  "metas": [],
  "shares": []
}
```

本项目范围内保留完整顶层结构和逐字段 AES 兼容行为：密码为空时字段原样保存；有密码时使用 CryptoJS AES，密文先 Base64 编码。`encrypted` 是对字符串 `"encrypted"` 的同样编码，用于验证密码。

还原时支持：

- 校验 `encrypted` 和密码；
- 默认以新建方式还原并清除 users/storages/metas 的 id；
- override 模式按 `username`、`mount_path`、`path` 更新已有记录；
- 忽略 settings 中的 `version` 与 `index_progress`；
- 保留未知字段，确保 OpenList 备份可往返。

## 非目标

暂不实现 OpenList 的用户体系、分享、任务、离线下载、归档、WebAuthn、LDAP、SSO 以及未列出的驱动；备份 JSON 中这些字段可以保留和透传，但不作为 EdgeList 的运行功能。
