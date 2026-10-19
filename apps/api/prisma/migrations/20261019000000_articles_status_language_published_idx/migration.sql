-- Public feed by language: WHERE status AND language ORDER BY publishedAt DESC, createdAt DESC.
-- Single statement on purpose: CREATE INDEX CONCURRENTLY cannot run inside a transaction, and Prisma sends a
-- multi-statement file as one implicit transaction. IF NOT EXISTS makes a re-run a no-op.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "articles_status_language_published_idx" ON "articles" ("status", "language", "publishedAt" DESC, "createdAt" DESC);
