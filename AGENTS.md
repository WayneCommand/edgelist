# AGENTS.md

## Project overview

EdgeList is an OpenList-compatible file manager implemented as a Cloudflare Worker with a React frontend.

- `src/worker/` contains the Hono Worker, authentication, OpenList-compatible APIs, backup/restore, metadata, and storage adapters.
- `src/worker/storage/` contains the OpenList, standard S3, and WebDAV adapters. S3 must remain provider-neutral; do not add Cloudflare R2-specific behavior.
- `src/react-app/` contains the React/Vite UI, routing, HeroUI components, file browsing, storage management, and Monaco text editing.
- `docs/` contains deployment and OpenList compatibility notes.
- `TODOLIST.md` is the feature checklist and should be updated when a requested feature is completed.

The application is deployed to Cloudflare Workers. Authentication uses AK/SK values read and validated by the Worker through KV. Do not move credential validation into the browser.

## Development commands

Use `pnpm` for all dependency and script commands. Do not use npm or yarn to modify the lockfile.

```bash
pnpm install
pnpm dev                 # Start the Vite/Workers development server
pnpm test                # Run the Vitest suite
pnpm lint                # Run ESLint
pnpm exec tsc -b         # Type-check the application and Worker
pnpm build               # Type-check and create a production build
pnpm check               # Type-check, build, and run Wrangler deploy --dry-run
pnpm deploy              # Deploy to Cloudflare Workers; use only when explicitly requested
pnpm cf-typegen          # Regenerate Cloudflare binding types
```

When a change affects both frontend and Worker behavior, run at least `pnpm test`, `pnpm lint`, and `pnpm build`. Use `pnpm check` before a deployment-related change when the local Cloudflare credentials and bindings are available.

## Code organization and style

- Keep frontend code under `src/react-app/` and Worker code under `src/worker/`.
- Use TypeScript and existing project conventions: tabs for indentation, semicolons, double quotes, and small focused functions.
- Prefer existing shared helpers such as `api`, `respond`, `failure`, path normalization, storage resolution, HeroUI components, and the existing toast system.
- Keep OpenList API response envelopes and field names compatible with the reference behavior. Confirm changes against `docs/OPENLIST-COMPATIBILITY.md` and the reference source when needed.
- File paths are URL-facing virtual paths. Normalize them before resolving a storage and preserve nested paths such as `/storage/a/b/c`.
- Add UI components in focused files when a change would make `App.tsx` harder to maintain.
- Use HeroUI and the existing theme variables for new UI. Keep loading states as HeroUI `Skeleton` components.
- Text/configuration file editing belongs in the Monaco editor component. Keep save operations authenticated through the existing Worker API.
- Avoid broad rewrites of unrelated code or formatting-only changes.

## Testing instructions

- Add or update tests beside the affected implementation when changing adapters, path handling, authentication, backup/restore, or API behavior.
- Test storage behavior through the adapter interface rather than coupling tests to one provider.
- Cover nested paths, root paths, URL encoding, empty directories, and provider error responses.
- For backup/restore changes, test OpenList-compatible JSON round trips and ensure unrelated existing storages are preserved.
- For UI changes, verify routing, loading states, authenticated requests, file preview/edit/save behavior, and error toasts.
- Before committing, run the smallest relevant test first, then the full validation commands required by the change.

## Security considerations

- Never commit AK/SK credentials, S3 keys, WebDAV passwords, session tokens, Cloudflare API tokens, or real customer URLs containing secrets.
- Read authentication secrets from KV/Worker bindings only. Never hard-code fallback production credentials or expose secrets in frontend bundles, logs, error messages, backup downloads, or test fixtures.
- Preserve authentication on file list, read, upload, download, rename, remove, metadata, storage management, backup, and restore endpoints.
- Validate and normalize user-controlled paths before selecting a storage or making an upstream request. Prevent traversal across mount paths and accidental access to another storage.
- Treat storage `addition` values as untrusted configuration. Validate JSON and required fields before constructing requests.
- Do not weaken TLS verification by default. The WebDAV “skip SSL certificate verification” option is intentionally disabled in the UI and must remain disabled unless the project requirements change explicitly.
- Preserve S3 Signature Version 4 canonicalization, URL encoding, path-style behavior, session tokens, and custom endpoints. Do not log canonical requests containing authorization material.
- Do not use destructive commands such as `git reset --hard` or recursive deletion unless the exact target and intent are explicitly confirmed.

## Deployment and configuration

- Cloudflare bindings and compatibility settings are defined in `wrangler.json` and generated types in `worker-configuration.d.ts`.
- Review `docs/DEPLOYMENT.md` before changing bindings or deployment configuration.
- Use `pnpm cf-typegen` after changing Cloudflare bindings, then run type-checking.
- Use `pnpm check` or `wrangler deploy --dry-run` to validate a deployment without publishing it.
- Only run `pnpm deploy` when the user explicitly asks for deployment. Do not push commits automatically.
- Keep deployment configuration provider-neutral. R2 is not a special adapter target; object storage uses the standard S3 interface.

## Git and commit guidelines

- Make one local commit for each independently completed implementation step.
- Do not push unless explicitly requested.
- Use concise conventional-style messages, for example:

  ```text
  feat: add WebDAV file operations
  fix: preserve storages during restore
  test: cover nested storage paths
  docs: add agent instructions
  ```

- A commit should contain only the implementation, tests, documentation, or configuration directly related to that step.
- Before handing off, report the commit hash and the validation commands that passed or any known environment-only warnings.
