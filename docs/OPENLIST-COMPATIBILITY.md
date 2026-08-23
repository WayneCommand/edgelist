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

文件对象至少包含 OpenList 前端依赖的 `name`、`size`、`is_dir`、`modified`、`created`、`path`、`hashinfo` 等元信息字段；具体驱动差异通过适配器隐藏。

## 存储适配器

Worker 内部统一抽象为 list、stat、read、write、mkdir、remove、rename；路由挂载路径后将逻辑路径转换为驱动路径。

- `openlist`：调用上游 OpenList 的 `/api/fs/*` API，并转发必要的文件流。
- `object`：先实现 S3 兼容对象存储；Cloudflare R2 通过 S3 兼容配置接入。
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

