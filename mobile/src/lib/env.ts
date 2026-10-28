import { z } from 'zod';

const schema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url().optional(),
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  EXPO_PUBLIC_APP_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default(
      process.env.NODE_ENV === 'production' ? 'production' : 'development',
    ),
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0),
});

export const env = schema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
    process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
});
