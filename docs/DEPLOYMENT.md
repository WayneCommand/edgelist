# EdgeList 部署

## 1. 创建 KV

```bash
pnpm exec wrangler kv namespace create EDGE_CONFIG
```

把命令输出的 namespace ID 写入 `wrangler.json` 的
`REPLACE_WITH_EDGE_CONFIG_KV_NAMESPACE_ID`。

然后写入认证配置：

```bash
pnpm exec wrangler kv key put --binding=EDGE_CONFIG config:auth \
  '{"accessKey":"your-access-key","secretKey":"your-secret-key","issuer":"edgelist"}'
```

## 2. 配置标准 S3 存储

在管理界面新增 `S3 object storage`，`addition` 填写：

```json
{
  "endpoint": "https://s3.example.com",
  "region": "us-east-1",
  "bucket": "my-bucket",
  "access_key_id": "ACCESS_KEY_ID",
  "secret_access_key": "SECRET_ACCESS_KEY",
  "force_path_style": true
}
```

Cloudflare R2、MinIO、AWS S3 及其他 S3-compatible 服务都使用这个配置；EdgeList 不需要 R2 原生 binding。

## 3. 本地验证和部署

```bash
pnpm install
pnpm test
pnpm check
pnpm deploy
```

`pnpm check` 会执行类型检查、Worker/前端构建和 Wrangler dry-run。部署前必须替换 KV namespace ID；S3 凭据只保存于 EdgeList 的 KV 配置中，不要提交到 Git。
