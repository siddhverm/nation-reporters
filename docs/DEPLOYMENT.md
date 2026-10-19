# Nation Reporters — Deployment guide

Production = one VPS (Docker Compose: postgres, redis, meilisearch, api, web) behind the **host nginx** (TLS via certbot).
Pushing to `master`/`main` triggers `.github/workflows/deploy.yml`, which SSHes into the VPS and runs `scripts/deploy-production.sh`.

```
browser ─▶ nginx :443 ─┬─ /api/proxy/*  ─▶ web  127.0.0.1:3000 (Next route handler → api)
                       ├─ /api/*        ─▶ api  127.0.0.1:3001 (NestJS, /api/v1/…)
                       └─ /*            ─▶ web  127.0.0.1:3000 (Next.js; /story-image/<slug>, /sitemap.xml, /copyright …)
api ─▶ postgres, redis, meilisearch, S3-compatible storage (story pictures), Gemini
```

## 1. One-time server setup
1. VPS with Docker + compose plugin + nginx + certbot (`scripts/setup-server.sh` automates Docker/clone; read it first — it assumes a shared nginx).
2. `git clone <repo> /opt/nation-reporters` (default branch must be `master`; the deploy scripts `reset --hard origin/master`).
3. `cp .env.template .env` and fill it in (see §2). `.env` is read by the `api` container (`env_file`) **and** by compose for `${…}` substitution. Never commit it.
4. nginx: install `infrastructure/nginx/nationreporters-host.conf` as `/etc/nginx/sites-available/nationreporters.com`, symlink into `sites-enabled`, `nginx -t && systemctl reload nginx`, then `certbot --nginx -d nationreporters.com -d www.nationreporters.com`.
   It **must** contain the `location /api/proxy/ → :3000` block *before* `/api/ → :3001` (the browser’s same-origin proxy is a Next route, not a Nest one). Re-copy the file after pulling this change.
   `infrastructure/nginx/nationreporters.conf` (conf.d, 443 block) and `nginx.conf` (all-in-docker) are alternatives; use one.
5. Story-picture storage (needed for any real picture, see §2): either point `S3_*` at an S3-compatible service, or run the bundled MinIO:
   `docker compose -f docker-compose.server.yml --profile storage up -d minio minio-init` and set `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=nation-reporters`, `S3_ACCESS_KEY`/`S3_SECRET_KEY` (strong values, not `minioadmin`).
6. GitHub → Settings → Secrets → Actions: `VPS_HOST` (IP), `VPS_USER` (`root`), `VPS_SSH_KEY` (full private key; its public key in the VPS `authorized_keys`).
7. Optional: `/opt/nation-reporters/.deploy.env` containing `BACKUP_DB=1` → every deploy first writes a `pg_dump` to `/opt/backups` (keeps 14).
8. First start: `cd /opt/nation-reporters && docker compose -f docker-compose.server.yml up -d --build` (API runs `prisma migrate deploy` on boot).
9. Seed/bootstrap content (only on a brand-new DB): note the production API image ships only `dist/` (no `src/`), so `prisma db seed` (ts-node on `src/prisma/seed.ts`) does **not** work inside it — run the seed from a dev checkout against the server DB or via `docker compose run` with the source mounted. Then run the ingestion bootstrap call described in `.env.template` (`INGESTION_BOOTSTRAP_KEY`).

## 2. Environment variables (server `.env`)
Required: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `MEILISEARCH_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_WEB_BASE_URL=https://nationreporters.com` (**the template default must be changed to the live origin; social posts use it for links and `/story-image/<slug>` pictures**).

| Variable | Default | Meaning |
|---|---|---|
| `IMAGE_MODE` | `source_first` | `source_first`: mirror the source item’s image into **our** S3 (SSRF-safe, validated, EXIF stripped, never hotlinked) + small copyright note; falls back to an AI picture. `generated_only`: never fetch source images (safe mode). Switch = edit `.env`, `docker compose -f docker-compose.server.yml up -d api` (restart api only). Existing articles keep their current picture until replaced (below). |
| `SOURCE_IMAGE_MAX_BYTES` / `_MIN_WIDTH` / `_MIN_HEIGHT` / `_MAX_PIXELS` / `_TIMEOUT_MS` | 5000000 / 600 / 315 / 50000000 / 15000 | source-image validation |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | local MinIO | **Without S3 no source image is ever used (never hotlinks) and AI images cannot be stored → fallback artwork everywhere.** |
| `GEMINI_API_KEY` | – | rewrite + AI pictures. Without it the rewrite step fails and `RAW_FALLBACK_MODE` applies. |
| `GEMINI_MODEL`, `GEMINI_MODEL_FALLBACKS` | gemini-2.5-flash / gemini-flash-latest,gemini-2.5-flash-lite | text model + comma-separated fallbacks. A retired/unknown model (404, "no longer available") switches to the next one automatically; the api log says `Gemini text: using model …`. If all fail, ingestion keeps items RAW (→ DRAFT fallback) and the scripts stop with "Set GEMINI_MODEL in .env". |
| `IMAGE_GEN_ENABLED`, `IMAGE_GEN_MODEL`, `IMAGE_GEN_MODEL_FALLBACKS`, `IMAGE_GEN_TIMEOUT_MS`, `IMAGE_GEN_MIN_INTERVAL_MS` | true / gemini-2.5-flash-image / gemini-3.1-flash-image / 40000 / 4000 | AI pictures; 404 → next fallback (`Gemini image: using model …` in the log). |
| `READING_LEVEL` | `simple` | `simple|plain|standard|advanced` |
| `REWRITE_MAX_LONG_WORDS`, `REWRITE_MAX_ATTEMPTS`, `REWRITE_MAX_OVERLAP`, `REWRITE_MAX_COPIED_RUN_WORDS/_CHARS`, `REWRITE_MIN_NUMBER_RETENTION` | 700 / 2 / 0.25 / 12 / 36 / 0.6 | copy-safety + quality gate (failures → `PENDING_REVIEW`) |
| `RAW_FALLBACK_MODE`, `RAW_FALLBACK_MAX_DRAFTS_PER_RUN` | `draft` / 30 | when the rewrite fails: hold as DRAFT (default) or publish a neutral placeholder; source text is never published |
| `COPYRIGHT_EMAIL` | empty | contact on `/copyright`; **runtime env of the `web` container** (compose passes it from `.env`). Empty = no address shown. |
| `INGESTION_SKIP_AI`, `FEATURE_AUTO_APPROVE`, social/Telegram/etc. | see `.env.template` | unchanged |

`NEXT_PUBLIC_API_URL` and `API_PROXY_TARGETS` for the web app are set in `docker-compose.server.yml`; they are read at runtime by server code, but anything inlined into client bundles uses build-time values, so changing them requires `--build web`.

## 3. Deploy checklist (every release)
1. **Before merging to `master`** (merging = deploying): CI green (PR to master/develop, or push to any other branch); read the diff of `apps/api/prisma/migrations/` — migrations run automatically on api start.
2. Confirm server `.env` has any **new** variables (§2) — compare with `.env.template`: `diff <(grep -o '^[A-Z_]*=' .env.template | sort -u) <(grep -o '^[A-Z_]*=' /opt/nation-reporters/.env | sort -u)`.
3. If migrations are included: set `BACKUP_DB=1` (or run `pg_dump` manually) first.
4. If nginx files changed (this release adds `/api/proxy/`): copy the file, `nginx -t && systemctl reload nginx` (deploy does **not** touch nginx).
5. Merge/push to `master`; watch Actions → *Deploy Nation Reporters*. Note the `Deployed <sha> (previous release: <sha>)` line.
6. Verify (§4).
7. Takedown/rollback readiness: know the previous SHA (§5).

## 4. Verification checklist (after deploy)
```bash
# on the VPS
cd /opt/nation-reporters && docker compose -f docker-compose.server.yml ps          # api, web healthy
docker compose -f docker-compose.server.yml logs api --tail 50 | grep -i "migrat"   # "migrations … applied" / no errors
curl -sf http://localhost:3001/api/v1/health/ready                                    # db/redis/search up
# from anywhere
curl -sI https://nationreporters.com/ | head -1                                       # 200
curl -s  https://nationreporters.com/sitemap.xml | head -5                            # <urlset …>
curl -s  https://nationreporters.com/robots.txt
curl -sI https://nationreporters.com/api/proxy/articles?limit=1 | head -3             # served by Next (JSON), NOT a 404 from Nest
curl -s  'https://nationreporters.com/api/v1/articles?limit=3&omitBody=true' | grep -o '"imageOrigin":"[a-z]*"' | sort | uniq -c
curl -sI https://nationreporters.com/story-image/<some-slug>                          # 200 image/*, header X-Story-Image: source|generated|fallback
curl -s https://nationreporters.com/copyright | grep -i "@"                           # COPYRIGHT_EMAIL visible
```
Leak check (must print nothing; use a story with a source image): `curl -s https://nationreporters.com/article/<slug> | grep -oiE '<publisher-domain>|/api/image'` and look at the page’s network tab: images must be `/story-image/<slug>` only (also in `og:image`, JSON-LD and `/api/v1/articles/<slug>`).
UI: story with a source image shows only the small “* We do not own the copyright of this image…” line; generated shows only “Illustration (AI-generated)”.
Redis: the country feed cache key is now `country-feed:v6:…` (bumped so cached feeds from before the source-name scrub are never served); the first requests after deploy are cold (expected).

## 5. Rollback
* Code: `ssh VPS 'bash /opt/nation-reporters/scripts/rollback-production.sh <previous-sha>'` (resets the server checkout, rebuilds api+web, waits for health). **Then revert the bad commit on `master`** — the next push redeploys `master` otherwise.
* Database: migrations here are additive (nullable column / `IF NOT EXISTS` table); older code runs fine against the newer schema, so no down-migration is needed. For a destructive failure restore the `pg_dump` from `/opt/backups`: `gunzip -c file.sql.gz | docker compose -f docker-compose.server.yml exec -T postgres psql -U $POSTGRES_USER nationreporters`.
* Pictures only (no code rollback): set `IMAGE_MODE=generated_only` in `.env` and restart api (`up -d api`); new stories stop using source images. To also switch **existing** stories, use the takedown tool below for each (or SQL: set `articles."imageOrigin"='generated'` and delete the `source-mirror/` objects — prefer the tool, it also clears caches).
* Nginx: restore the previous vhost file, `nginx -t && systemctl reload nginx`.

## 5a. Source-name scrub, old-story rewrite and picture backfill (run once after the deploy that ships them)

What changed: every public text field (title, body, excerpt, bodyShort/Medium, aiVideo, podcastScript, SEO, image alt/captions, hashtags) passes `scrubSourceMentions` at **read time**, so existing stories are clean the moment the new API is live (page chrome such as “Trending Stories / Join conversation” is dropped too). The rewrite pipeline never names the publisher and fails the draft to the safe fallback (`RAW_FALLBACK_MODE=draft`) if a name survives. Any push/social text must be built with `sanitizeTextForPublic` (the helper the serializer uses). The scripts below make the cleaning permanent in the database and repair pictures.

```bash
cd /opt/nation-reporters && git pull && bash scripts/deploy-production.sh

# 1) rewrite old PUBLISHED stories (dry run first: no model calls, no writes — lists what would change)
docker compose -f docker-compose.server.yml exec api npm run rewrite:existing-stories:prod -- --limit 500
# apply in batches (Gemini quota-friendly; re-run until "would_rewrite" is 0; it is idempotent and stops by itself on quota)
docker compose -f docker-compose.server.yml exec api npm run rewrite:existing-stories:prod -- --apply --limit 100 --delay-ms 4000
#   options: --since 2026-08-01 (only newer than)   --batch-size 25
#   Stories that cannot be rewritten safely (page-boilerplate only / cut off / publisher name left) are set to DRAFT, never deleted.

# 2) pictures: re-resolve + mirror the SOURCE image for stories whose image object is missing from S3
docker compose -f docker-compose.server.yml exec api npm run backfill:story-images:prod -- --limit 500
docker compose -f docker-compose.server.yml exec api npm run backfill:story-images:prod -- --apply --limit 200 --delay-ms 1500
#   options: --since / --before YYYY-MM-DD, --slug <slug> (one story)
#   order: stored/legacy image URL → article page og:image/twitter:image (SSRF-safe, size capped) → AI picture → fallback artwork.
#   Prints counts per outcome: source_mirrored / generated / fallback / ok_present / error. Stops on a storage outage.
```
Name matching rules (since the empty-title fix): only clearly unique outlet tokens (TOI, PTI, ANI, IANS, TNN, NDTV, Times of India, Hindustan Times, domain names like ndtv.com) are removed as bare words; every other name — including all names from the sources table — is removed only in attribution context ("according to X", "X reported", "told X", "(X)", "– X", "X: headline", "Download the X app"), so a company that is the story's subject ("Fairfax gets 15 years…", "Reuters shares fall") is kept. Sources-table names that are common words or short ("Wire", "Mint", "Star", "Scroll") are ignored. Titles/excerpts are never returned empty: a story stored without a title gets one from seoTitle / the first sentence of the excerpt at read time, and the rewrite script re-selects such stories (`issues=empty_title`, even if already processed):
```bash
docker compose -f docker-compose.server.yml exec api npm run rewrite:existing-stories:prod -- --limit 500 | grep empty_title   # dry run
docker compose -f docker-compose.server.yml exec api npm run rewrite:existing-stories:prod -- --apply --limit 100 --delay-ms 4000
```
Both scripts purge `country-feed:*` after `--apply`. Output lines: `RETRY LATER (quota/rate limit)` → re-run later; `RETRY LATER (temporary error)` → re-run; `MODEL ERROR … Set GEMINI_MODEL in .env` (exit code 2, nothing changed) → the configured Gemini model is retired: set `GEMINI_MODEL` / `IMAGE_GEN_MODEL` in `.env`, then `docker compose -f docker-compose.server.yml up -d api` and re-run. Check which model is live: `docker compose -f docker-compose.server.yml logs api | grep "using model"`. To flush the cache manually (or after editing data by hand):
```bash
docker compose -f docker-compose.server.yml exec redis sh -c 'redis-cli --scan --pattern "country-feed:*" | xargs -r redis-cli del'
# (add -a "$REDIS_PASSWORD" to redis-cli if your Redis has a password)
```
Cache key version lives in `apps/api/src/modules/articles/articles.service.ts` (`country-feed:v6:`); bump it to `v7` in any release that changes the serialized story shape and old cached feeds must not be served.
Storage upload retries: `S3_PUT_RETRIES` (default 3) and `S3_RETRY_BASE_MS` (default 500). A story is never marked `generated` just because storage failed — the picture stays pending/fallback and the backfill retries it.

## 6. Image takedown runbook (copyright request)
```bash
cd /opt/nation-reporters
docker compose -f docker-compose.server.yml exec api npm run image:replace-with-generated:prod -- <slug> --dry-run
docker compose -f docker-compose.server.yml exec api npm run image:replace-with-generated:prod -- <slug>
```
Deletes the mirrored S3 object + asset row, flips the story to `generated`, generates an AI picture (or fallback artwork), purges `country-feed:*` cache. Staff alternative: `POST /api/v1/articles/<slug|id>/image/replace-with-generated` with a CHIEF_EDITOR/ADMIN JWT. Reply to the requester from `COPYRIGHT_EMAIL`. Allow up to 1 h for browsers (`Cache-Control: max-age=3600` on source images) and any CDN; purge the CDN path `/story-image/<slug>` if one is added.

## 7. Known gaps / risks (see also final review notes)
* The deploy SSH step runs `git reset --hard origin/master` on the server — local edits to tracked files on the VPS are lost. Keep server-specific config in `.env`/`.deploy.env` (untracked).
* nginx and `.env` are not deployed by CI; changes must be applied by hand.
* There is no staging environment; CI only builds/tests (no deploy preview).
* ESLint: no ESLint config files exist in `apps/api` or `apps/web`, so the `lint` scripts cannot pass as written.
* `docker-compose.server.yml` uses unpinned `minio/*:latest` for the optional storage profile — pin before relying on it.
* `source_first` publishes publisher images with a disclaimer; that is a legal/editorial decision — keep `COPYRIGHT_EMAIL` monitored and use `generated_only` if complaints arrive.
