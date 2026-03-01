import { z } from 'zod';

const schema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url().optional(),
});

export const env = schema.parse({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});
