export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiPort: parseInt(process.env.API_PORT ?? '3000', 10),
  corsOrigins: process.env.CORS_ORIGINS ?? '',
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  cookieSecure: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh',
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
    openaiApiKey:  process.env.OPENAI_API_KEY   ?? '',
    openaiModel:   process.env.OPENAI_MODEL      ?? 'gpt-4o-mini',
    openaiBaseUrl: process.env.OPENAI_BASE_URL   ?? 'https://api.openai.com/v1',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local', // 'local' | 'supabase'
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'timeforge',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'TimeForge Team <no-reply@timeforge.com>',
  },
});
