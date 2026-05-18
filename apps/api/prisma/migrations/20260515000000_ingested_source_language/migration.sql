-- Align DB with schema: per-feed language for regional RSS (bn, ta, gu, pa, ur, …).
ALTER TABLE "ingested_sources" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';
