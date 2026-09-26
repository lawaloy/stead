import { randomUUID } from 'node:crypto';
import {
  apiClient,
  configureApiAuth,
  createGoal,
  createTransaction,
  deleteAccount,
  deleteTransaction,
  fetchAuthCountries,
  getActiveGoal,
  getDashboardStability,
  listTransactions,
  requestOtp,
  updateTransaction,
  verifyOtp,
} from '../src/lib/api';

jest.mock('../src/lib/base-url', () => ({
  resolveApiBaseUrl: () => process.env.STEAD_TEST_API_URL,
}));
jest.mock('../src/lib/installation-id-store', () => ({
  installationIdStore: {
    getOrCreateId: async () => process.env.STEAD_TEST_INSTALLATION_ID,
  },
}));

jest.setTimeout(60_000);

const endpoint = process.env.STEAD_TEST_API_URL;
if (
  !endpoint ||
  !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)
) {
  throw new Error(
    'Live mobile/API journey requires STEAD_TEST_API_URL on localhost',
  );
}

describe('critical mobile client to live API journey', () => {
  let sessionToken: string | null = null;
  let sessionRefreshToken: string | null = null;
  const unauthorized = jest.fn();

  const bindSession = () => {
    configureApiAuth({
      getToken: async () => sessionToken,
      getRefreshToken: async () => sessionRefreshToken,
      persistSession: async (session) => {
        sessionToken = session.token;
        sessionRefreshToken = session.refreshToken;
      },
      onUnauthorized: unauthorized,
    });
  };

  beforeAll(() => {
    // A failed run may not reach verification and thus cannot delete its user.
    // Keep its device telemetry from rate-limiting a later local rerun.
    process.env.STEAD_TEST_INSTALLATION_ID = randomUUID();
    apiClient.defaults.baseURL = endpoint;
    bindSession();
  });

  afterEach(async () => {
    if (!sessionToken) return;
    bindSession();
    try {
      await expect(deleteAccount()).resolves.toMatchObject({ ok: true });
    } finally {
      sessionToken = null;
      sessionRefreshToken = null;
    }
  });

  afterAll(() => {
    delete process.env.STEAD_TEST_INSTALLATION_ID;
    configureApiAuth({
      getToken: async () => null,
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized: () => undefined,
    });
  });

  it('authenticates, manages a goal and transactions, refreshes the dashboard, restores and logs out', async () => {
    const countries = await fetchAuthCountries();
    expect(countries.countries.some((country) => country.iso === 'NG')).toBe(
      true,
    );

    const phone = `0803${Math.floor(Math.random() * 10_000_000)
      .toString()
      .padStart(7, '0')}`;
    const requested = await requestOtp(phone, 'NG');
    expect(requested.ok).toBe(true);
    if (!requested.otp)
      throw new Error('Live test API must expose the dev OTP');
    const verified = await verifyOtp(phone, 'NG', requested.otp);
    sessionToken = verified.token;
    sessionRefreshToken = verified.refreshToken;
    expect(sessionToken).toEqual(expect.any(String));
    expect(sessionRefreshToken).toEqual(expect.any(String));
    bindSession();

    const dueDate = new Date();
    dueDate.setUTCFullYear(dueDate.getUTCFullYear() + 1);
    const goal = await createGoal({
      name: 'Journey rent',
      amountTotalKobo: 120_000_000,
      dueDate: dueDate.toISOString(),
      monthlyIncomeKobo: 30_000_000,
    });
    expect((await getActiveGoal())?.id).toBe(goal.id);

    const before = await getDashboardStability();
    expect(before.ok).toBe(true);
    if (!before.ok) throw new Error('Expected active-goal dashboard');
    expect(before.metrics.goalSavedKobo).toBe(0);

    const occurredAt = new Date().toISOString();
    const income = await createTransaction({
      direction: 'in',
      amountKobo: 500_000,
      occurredAt,
      note: 'Journey income',
      goalId: goal.id,
    });
    const expense = await createTransaction({
      direction: 'out',
      amountKobo: 100_000,
      occurredAt,
      note: 'Journey expense',
      goalId: goal.id,
    });
    expect((await listTransactions()).map((row) => row.id)).toEqual(
      expect.arrayContaining([income.id, expense.id]),
    );

    const afterEntry = await getDashboardStability();
    expect(afterEntry.ok).toBe(true);
    if (!afterEntry.ok) throw new Error('Expected populated dashboard');
    expect(afterEntry.metrics.goalSavedKobo).toBe(400_000);
    expect(afterEntry.metrics.estimatedBalanceKobo).toBe(400_000);

    await updateTransaction(expense.id, {
      amountKobo: 200_000,
      note: 'Journey expense corrected',
    });
    expect(
      (await listTransactions()).find((row) => row.id === expense.id),
    ).toMatchObject({
      amountKobo: 200_000,
      note: 'Journey expense corrected',
    });
    const afterEdit = await getDashboardStability();
    expect(afterEdit.ok).toBe(true);
    if (!afterEdit.ok) throw new Error('Expected recalculated dashboard');
    expect(afterEdit.metrics.goalSavedKobo).toBe(300_000);

    await deleteTransaction(expense.id);
    expect((await listTransactions()).map((row) => row.id)).not.toContain(
      expense.id,
    );
    const afterDelete = await getDashboardStability();
    expect(afterDelete.ok).toBe(true);
    if (!afterDelete.ok) throw new Error('Expected dashboard after deletion');
    expect(afterDelete.metrics.goalSavedKobo).toBe(500_000);

    // A new client instance restores the saved bearer credential; the server
    // remains authoritative for its validity and the data it can read.
    const savedToken = sessionToken;
    const savedRefresh = sessionRefreshToken;
    sessionToken = null;
    sessionRefreshToken = null;
    configureApiAuth({
      getToken: async () => savedToken,
      getRefreshToken: async () => savedRefresh,
      persistSession: async (session) => {
        sessionToken = session.token;
        sessionRefreshToken = session.refreshToken;
      },
      onUnauthorized: unauthorized,
    });
    expect((await getActiveGoal())?.id).toBe(goal.id);
    expect((await getDashboardStability()).ok).toBe(true);

    // Local logout removes stored credentials. Server revoke is covered by the
    // mobile AuthProvider logout path against /auth/logout.
    configureApiAuth({
      getToken: async () => null,
      getRefreshToken: async () => null,
      persistSession: async () => undefined,
      onUnauthorized: unauthorized,
    });
    await expect(getDashboardStability()).rejects.toMatchObject({
      status: 401,
    });
    expect(unauthorized).toHaveBeenCalledTimes(1);

    // afterEach retains the authenticated token for account cleanup, even
    // when an assertion above fails.
    sessionToken = savedToken;
    sessionRefreshToken = savedRefresh;
  });
});
