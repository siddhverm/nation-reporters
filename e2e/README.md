# Local end-to-end checks (no external calls)

1. Fake API (real ArticlesController/Service + real public sanitizers, in-memory data from `test-fixtures/news-fixtures.json`, 23 languages, dirty on purpose):
   `cd apps/api && PORT=4010 npx ts-node --transpile-only e2e/fake-api.ts`
2. Web against it:
   `cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:4010/api/v1 API_PROXY_TARGETS=http://localhost:4010/api/v1 npx next build && NEXT_PUBLIC_API_URL=http://localhost:4010/api/v1 API_PROXY_TARGETS=http://localhost:4010/api/v1 npx next start -p 3010`
3. Browser matrix (headless Chrome, screenshots at 390x844 and 1280x800 into `apps/web/e2e/out/`):
   `cd apps/web && npm i --no-save puppeteer-core && node e2e/browser-matrix.js`

Unit tests: `npm test --workspace=@nation-reporters/api` and `npm test --workspace=@nation-reporters/web`.
