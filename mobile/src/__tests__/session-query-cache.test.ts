import { QueryClient } from '@tanstack/react-query';
import {
  clearSessionQueryCache,
  sessionQueryKeys,
} from '../lib/session-query-cache';

const userADashboard = {
  ok: true as const,
  goal: { id: 'goal_a', name: 'User A rent' },
  metrics: { goalSavedKobo: 80_000, estimatedBalanceKobo: 80_000 },
};

describe('session query cache', () => {
  it('isolates finance queries by session token', () => {
    const client = new QueryClient();
    client.setQueryData(sessionQueryKeys.dashboard('token-a'), userADashboard);

    expect(client.getQueryData(sessionQueryKeys.dashboard('token-b'))).toBeUndefined();
    expect(client.getQueryData(sessionQueryKeys.dashboard('token-a'))).toEqual(
      userADashboard,
    );
  });

  it('drops cached finance data so a later login cannot reuse it', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 15_000, retry: false } },
    });
    client.setQueryData(sessionQueryKeys.dashboard('token-a'), userADashboard);
    client.setQueryData(sessionQueryKeys.activeGoal('token-a'), {
      id: 'goal_a',
      name: 'User A rent',
    });

    await clearSessionQueryCache(client);

    expect(client.getQueryData(sessionQueryKeys.dashboard('token-a'))).toBeUndefined();
    expect(client.getQueryData(sessionQueryKeys.activeGoal('token-a'))).toBeUndefined();
    expect(client.getQueryData(sessionQueryKeys.dashboard('token-b'))).toBeUndefined();
  });

  it('cancels in-flight fetches so they cannot repopulate the cache after logout', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const pending = client.fetchQuery({
      queryKey: sessionQueryKeys.dashboard('token-a'),
      queryFn: ({ signal }) =>
        new Promise((resolve, reject) => {
          const onAbort = () => reject(new Error('aborted'));
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort);
        }),
    });

    await clearSessionQueryCache(client);

    await expect(pending).rejects.toThrow();
    expect(client.getQueryData(sessionQueryKeys.dashboard('token-a'))).toBeUndefined();
  });
});
