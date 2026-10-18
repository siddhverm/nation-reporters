-- Catch-up migration: model WebPushSubscription was added to schema.prisma without a migration
-- (a fresh `prisma migrate deploy` database lacked the table). Idempotent, so it is safe on databases
-- that already have it (e.g. created with `prisma db push`).
CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "language" TEXT,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "web_push_subscriptions_endpoint_key" ON "web_push_subscriptions"("endpoint");
