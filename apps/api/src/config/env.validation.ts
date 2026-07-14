import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.string().default('development'),
    API_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DIRECT_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_ACCESS_SECRET: z.string().min(8, 'JWT_ACCESS_SECRET must be at least 8 characters'),
    JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET must be at least 8 characters'),
    JWT_ACCESS_TTL: z.coerce.number().default(900),
    JWT_REFRESH_TTL: z.coerce.number().default(1209600),
    CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required — comma-separated allowed origins'),
    COOKIE_SECURE: z
      .string()
      .default('false')
      .refine((v) => v === 'true' || v === 'false', 'COOKIE_SECURE must be "true" or "false"'),
    // Storage (Supabase optional; required only when STORAGE_DRIVER=supabase)
    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().optional(),
    // Transactional email transport selection. 'auto' (default) prefers the
    // Supabase Edge Function whenever Supabase is configured, else falls back
    // to SMTP, else a console mock. Set 'edge' on hosts that block outbound
    // SMTP (e.g. Railway) to force the edge function even when SMTP_* are set.
    MAIL_DRIVER: z.enum(['auto', 'edge', 'smtp', 'mock']).default('auto'),
    // Google SMTP Configuration
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('TimeForge Team <no-reply@timeforge.com>'),
    ARGON2_MEMORY_COST: z.coerce.number().positive().default(65536),
    // Rate limiting
    RATE_LIMIT_TTL: z.coerce.number().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().positive().default(120),
    // Registration defaults
    DEFAULT_TENANT_SLUG: z.string().default('demo'),
    DEFAULT_ORG_SLUG: z.string().default('demo-org'),
    // AI provider config
    AI_PROVIDER: z.enum(['OPENAI', 'ANTHROPIC', 'LOCAL']).default('OPENAI'),
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required when AI_PROVIDER=OPENAI'),
    OPENAI_MODEL: z.string().default('qwen/qwen3.6-plus'),
    OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.STORAGE_DRIVER === 'supabase' && (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase',
        path: ['SUPABASE_URL'],
      });
    }
    if (cfg.NODE_ENV === 'production' && cfg.COOKIE_SECURE !== 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'COOKIE_SECURE must be "true" in production (HTTPS required)',
        path: ['COOKIE_SECURE'],
      });
    }
    if (cfg.NODE_ENV === 'production' && cfg.REDIS_URL === 'redis://localhost:6379') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'REDIS_URL must point to a remote Redis instance in production',
        path: ['REDIS_URL'],
      });
    }
    const placeholderSecrets = new Set([
      'change-me-access-secret',
      'change-me-refresh-secret',
      'dev-access-secret-min-8-chars',
      'dev-refresh-secret-min-8-chars',
    ]);
    if (cfg.NODE_ENV === 'production' && placeholderSecrets.has(cfg.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET is a placeholder dev value — set a real secret in production',
        path: ['JWT_ACCESS_SECRET'],
      });
    }
    if (cfg.NODE_ENV === 'production' && placeholderSecrets.has(cfg.JWT_REFRESH_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_REFRESH_SECRET is a placeholder dev value — set a real secret in production',
        path: ['JWT_REFRESH_SECRET'],
      });
    }
  });

/** Validates process.env at boot; throws a readable error on misconfig. */
export function validate(config: Record<string, unknown>) {
  const parsed = schema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return { ...config, ...parsed.data };
}
