export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Most host platforms (Railway, Render, Fly.io, Heroku) inject PORT and expect
  // the app to bind to it; API_PORT remains the override for local/manual setups.
  apiPort: parseInt(process.env.PORT ?? process.env.API_PORT ?? '3000', 10),
  corsOrigins: process.env.CORS_ORIGINS ?? '',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  cookieSecure: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  jwt: {
    // Intentionally no ?? fallback — Zod env.validation.ts requires min(8) and
    // will throw at boot if these are missing. A silent fallback would defeat
    // that check and create a critical auth-bypass vulnerability.
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '1209600', 10),
  },
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },
  registration: {
    defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG ?? 'demo',
    defaultOrgSlug: process.env.DEFAULT_ORG_SLUG ?? 'demo-org',
  },
  ai: {
    provider: process.env.AI_PROVIDER ?? 'OPENAI',
    openaiApiKey:  process.env.OPENAI_API_KEY!,
    openaiModel:   process.env.OPENAI_MODEL      ?? 'qwen/qwen3.6-plus',
    openaiBaseUrl: process.env.OPENAI_BASE_URL   ?? 'https://api.openai.com/v1',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
  },
  argon2: {
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '65536', 10),
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'timeforge',
  },
  mail: {
    // 'auto' | 'edge' | 'smtp' | 'mock' — see env.validation.ts / MailerService.
    driver: process.env.MAIL_DRIVER ?? 'auto',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'TimeForge Team <no-reply@timeforge.com>',
  },
});
