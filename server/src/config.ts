function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.NEXUS_PORT ?? 3100),
  databaseUrl: required('NEXUS_DATABASE_URL', 'postgres://nexus:nexus@localhost:5432/nexus'),
  jwtSecret: required('NEXUS_JWT_SECRET', 'change-me'),
  internalUrl: required('NEXUS_INTERNAL_URL', 'http://nexus:3101'),
  webhookSecret: required('NEXUS_WEBHOOK_SECRET', 'change-me-too'),
  wahaUrl: required('NEXUS_WAHA_URL', 'http://localhost:3000'),
  wahaApiKey: process.env.NEXUS_WAHA_API_KEY ?? '',
  wahaEngine: process.env.NEXUS_WAHA_ENGINE ?? '',
  adminEmail: process.env.NEXUS_ADMIN_EMAIL ?? 'admin@nexus.local',
  adminPassword: process.env.NEXUS_ADMIN_PASSWORD ?? 'admin1234',
  schedulerTickMs: Number(process.env.NEXUS_SCHEDULER_TICK_MS ?? 1000),
  defaultCountryCode: process.env.NEXUS_DEFAULT_COUNTRY_CODE ?? '98',
  mediaDir: process.env.NEXUS_MEDIA_DIR ?? '/data/media',
  maxDailyCap: Number(process.env.NEXUS_MAX_DAILY_CAP ?? 1000000),
  maxRatePerMinute: Number(process.env.NEXUS_MAX_RATE_PER_MINUTE ?? 120),
};
