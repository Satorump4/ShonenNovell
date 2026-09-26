import { existsSync } from 'node:fs';
import { z } from 'zod';

// Локально переменные берутся из .env; на Railway их задаёт платформа
// (loadEnvFile не перезаписывает уже заданные переменные окружения).
if (existsSync('.env')) process.loadEnvFile('.env');

const flag = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),

    ADMIN_USERNAME: z.string().trim().min(3).max(64).optional(),
    ADMIN_PASSWORD: z.string().min(10, 'ADMIN_PASSWORD must be at least 10 characters').max(200).optional(),
    ADMIN_RESET_PASSWORD: flag(false),

    STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
    STORAGE_DIR: z.string().default('./storage/uploads'),

    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().url().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.string().url().optional(),
    S3_FORCE_PATH_STYLE: flag(false),

    CORS_ORIGIN: z.string().optional(),
    MAX_AUDIO_MB: z.coerce.number().positive().max(200).default(25),
    MAX_IMAGE_MB: z.coerce.number().positive().max(50).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_TYPE === 's3') {
      for (const key of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_TYPE=s3` });
      }
    }
  });

// Пустые значения из .env ("S3_BUCKET=") считаем незаданными.
const raw = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]));
const parsed = EnvSchema.safeParse(raw);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
