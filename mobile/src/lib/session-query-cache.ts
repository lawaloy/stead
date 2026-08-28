import type { QueryClient } from '@tanstack/react-query';
import { queryClient as defaultQueryClient } from './query-client';

export const sessionQueryKeys = {
  dashboard: (sessionId: string | null) =>
    ['dashboard', 'stability', sessionId] as const,
  activeGoal: (sessionId: string | null) =>
    ['goal', 'active', sessionId] as const,
  transactions: (sessionId: string | null) =>
    ['transactions', sessionId] as const,
};

export async function clearSessionQueryCache(
  client: QueryClient = defaultQueryClient,
) {
  await client.cancelQueries();
  client.clear();
}
