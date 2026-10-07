import type { QueryClient } from '@tanstack/react-query';
import { queryClient as defaultQueryClient } from '../lib/query-client';
import { clearSessionQueryCache } from '../lib/session-query-cache';

/**
 * Cancel in-flight queries and clear the shared QueryClient so notifyManager
 * has no subscribers left after a test ends.
 */
export async function teardownTestQueryClient(
  client: QueryClient = defaultQueryClient,
): Promise<void> {
  await clearSessionQueryCache(client);
}

/**
 * Drain notifyManager's default setTimeout(0) batches after a suite so delayed
 * Query notifications cannot console.error after Jest finishes the file.
 */
export async function flushQueryClientNotifications(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
