import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  MFA_ISSUER: z.string().default('NationReporters'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_REGION: z.string().default('us-east-1'),

  MEILISEARCH_URL: z.string().url(),
  MEILISEARCH_KEY: z.string(),

  GEMINI_API_KEY: z.string(),
  RESEND_API_KEY: z.string().optional(),

  FEATURE_AUTO_APPROVE: z.coerce.boolean().default(false),
  FEATURE_TTS: z.coerce.boolean().default(false),
  INGESTION_MAX_PER_CATEGORY: z.coerce.number().int().positive().default(20),
  INGESTION_MAX_FEED_ITEMS_SCAN: z.coerce.number().int().positive().default(100),
  COUNTRY_FEED_CACHE_TTL_MS: z.coerce.number().int().positive().default(120000),
  INGESTION_EXPECTED_INTERVAL_HOURS: z.coerce.number().positive().default(10),
  VIDEO_GENERATION_ENABLED: z.coerce.boolean().default(false),
  VIDEO_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  VIDEO_RENDER_SECONDS: z.coerce.number().int().positive().default(45),
  VIDEO_FFMPEG_PATH: z.string().default('ffmpeg'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Environment validation failed:\n${result.error.toString()}`);
  }
  return result.data;
}
