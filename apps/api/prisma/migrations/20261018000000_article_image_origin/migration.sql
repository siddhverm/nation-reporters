-- Story picture origin: 'source' (mirrored source image) | 'generated' (AI). NULL is treated as generated.
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "imageOrigin" TEXT;
