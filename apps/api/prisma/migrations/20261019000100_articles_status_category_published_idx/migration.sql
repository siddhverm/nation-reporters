-- Topic/category pages: WHERE status AND categoryId ORDER BY publishedAt DESC, createdAt DESC.
-- Single statement on purpose: CREATE INDEX CONCURRENTLY cannot run inside a transaction, and Prisma sends a
-- multi-statement file as one implicit transaction. IF NOT EXISTS makes a re-run a no-op.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "articles_status_category_published_idx" ON "articles" ("status", "categoryId", "publishedAt" DESC, "createdAt" DESC);
