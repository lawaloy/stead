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

  it('does not share finance cache between a session token and a logged-out key', () => {
    const client = new QueryClient();
    client.setQueryData(sessionQueryKeys.dashboard('token-a'), userADashboard);
    client.setQueryData(sessionQueryKeys.dashboard(null), {
      ok: false as const,
      goal: null,
      metrics: { goalSavedKobo: 0, estimatedBalanceKobo: 0 },
    });

    expect(client.getQueryData(sessionQueryKeys.dashboard('token-a'))).toEqual(
      userADashboard,
    );
    expect(client.getQueryData(sessionQueryKeys.dashboard(null))).not.toEqual(
      userADashboard,
    );
    expect(client.getQueryData(sessionQueryKeys.dashboard(''))).toBeUndefined();
  });

  it('lets unscoped mutation invalidation prefixes still hit session-scoped finance keys', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 15_000, retry: false } },
    });
    client.setQueryData(sessionQueryKeys.dashboard('token-a'), userADashboard);
    client.setQueryData(sessionQueryKeys.activeGoal('token-a'), {
      id: 'goal_a',
      name: 'User A rent',
    });
    client.setQueryData(sessionQueryKeys.transactions('token-a'), [{ id: 'tx_a' }]);

    await client.invalidateQueries({ queryKey: ['dashboard', 'stability'] });
    await client.invalidateQueries({ queryKey: ['goal', 'active'] });
    await client.invalidateQueries({ queryKey: ['transactions'] });

    expect(
      client.getQueryState(sessionQueryKeys.dashboard('token-a'))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(sessionQueryKeys.activeGoal('token-a'))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(sessionQueryKeys.transactions('token-a'))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(sessionQueryKeys.dashboard('token-b'))?.isInvalidated,
    ).toBeUndefined();
  });

  it('drops leftover unscoped finance keys so a later login cannot read them', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 15_000, retry: false } },
    });
    client.setQueryData(['dashboard', 'stability'], userADashboard);
    client.setQueryData(['goal', 'active'], { id: 'goal_a', name: 'User A rent' });

    await clearSessionQueryCache(client);

    expect(client.getQueryData(['dashboard', 'stability'])).toBeUndefined();
    expect(client.getQueryData(['goal', 'active'])).toBeUndefined();
  });

  it('does not keep a late fetch that ignored cancellation after logout', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let finish: (value: typeof userADashboard) => void = () => undefined;
    const pending = client.fetchQuery({
      queryKey: sessionQueryKeys.dashboard('token-a'),
      queryFn: () =>
        new Promise<typeof userADashboard>((resolve) => {
          finish = resolve;
        }),
    });
    const settled = pending.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    );

    await clearSessionQueryCache(client);
    finish(userADashboard);
    await settled;
    await Promise.resolve();

    expect(client.getQueryData(sessionQueryKeys.dashboard('token-a'))).toBeUndefined();
  });
});
