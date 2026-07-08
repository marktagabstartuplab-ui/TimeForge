import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.string().default('development'),
    API_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1).optional(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_ACCESS_SECRET: z.string().min(8),
    JWT_REFRESH_SECRET: z.string().min(8),
    JWT_ACCESS_TTL: z.coerce.number().default(900),
    JWT_REFRESH_TTL: z.coerce.number().default(1209600),
    // Storage (Supabase optional; required only when STORAGE_DRIVER=supabase)
    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().optional(),
    // Google SMTP Configuration
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('TimeForge Team <no-reply@timeforge.com>'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.STORAGE_DRIVER === 'supabase' && (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase',
        path: ['SUPABASE_URL'],
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
