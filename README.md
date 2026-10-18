# Nation Reporters

Multilingual (23 languages) AI-assisted news platform — NestJS API (`apps/api`), Next.js web (`apps/web`), shared types (`packages/shared-types`).

## Develop
```bash
cp .env.template .env            # fill in secrets
docker compose up -d             # postgres, redis, meilisearch, minio (see docker-compose.yml)
npm ci
npm run -w @nation-reporters/api dev
npm run -w @nation-reporters/web dev
npm test --workspace=@nation-reporters/api && npm test --workspace=@nation-reporters/web
```
Local end-to-end checks without external calls (fake API + 23-language browser matrix): [`e2e/README.md`](e2e/README.md) and `apps/web/e2e/`.

## Stories: language, pictures, copyright
* Stories are rewritten in simple language (`READING_LEVEL`) with a copy-safety gate; failures are held for review (`RAW_FALLBACK_MODE`). Source text/URL/outlet names are never public.
* **`IMAGE_MODE`** selects the picture policy:
  * `source_first` (default): the source item’s image is fetched server-side (http/https only, no private IPs, redirects re-checked, size/type/min-dimension validated, EXIF/metadata stripped), mirrored into **our** S3 and served as `/story-image/<slug>` with alt text = headline and only the small note *“* We do not own the copyright of this image. Image belongs to its original owner; removed on request.”* (translated in all 23 languages). No source domain/URL appears in HTML, API, OG tags, JSON-LD or social posts. A missing/broken/too-small image falls back to an AI-generated picture, which carries only the label “Illustration (AI-generated)”.
  * `generated_only` (safe mode): never fetch source images.
  The origin is stored per story (`articles.imageOrigin`: `source` | `generated`) and exposed as `imageOrigin` / `image.origin`.
* Takedown: `npm run image:replace-with-generated -- <slug>` (in `apps/api`; in the production container use `image:replace-with-generated:prod`) or the staff endpoint `POST /api/v1/articles/:idOrSlug/image/replace-with-generated`. Contact address on the public `/copyright` page: `COPYRIGHT_EMAIL`.

## Deploy
See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (setup, env vars, deploy + verification checklist, rollback, takedown runbook, known gaps). Pushing to `master` deploys to the VPS automatically.
