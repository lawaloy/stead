import { createAxiosMock } from './axios-mock';
import {
  apiClient,
  configureApiAuth,
  createGoal,
  createTransaction,
  getActiveGoal,
  getDashboardStability,
} from '../lib/api';

jest.mock('../lib/base-url', () => ({
  resolveApiBaseUrl: () => 'http://localhost:3000',
}));

describe('api finance client', () => {
  const mock = createAxiosMock(apiClient);

  const goalResponse = {
    id: 'goal_1',
    userId: 'user_1',
    name: 'Rent',
    amountTotalKobo: 120_000_000,
    dueDate: '2026-12-31T00:00:00.000Z',
    monthlyIncomeKobo: 30_000_000,
    isActive: true,
    createdAt: '2026-06-21T12:00:00.000Z',
  };

  const transactionResponse = {
    id: 'tx_1',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 500_000,
    direction: 'in',
    occurredAt: '2026-06-21T12:00:00.000Z',
    note: 'manual entry',
    createdAt: '2026-06-21T12:01:00.000Z',
  };

  afterEach(() => {
    mock.reset();
    configureApiAuth({
      getToken: async () => null,
      onUnauthorized: () => undefined,
    });
  });

  it('gets the active goal and parses the GoalSchema response', async () => {
    mock.onGet('/goals/active').reply(200, goalResponse);

    await expect(getActiveGoal()).resolves.toEqual(goalResponse);
  });

  it('posts createGoal payloads and parses the GoalSchema response', async () => {
    mock.onPost('/goals').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        name: 'Rent',
        amountTotalKobo: 120_000_000,
        dueDate: '2026-12-31T00:00:00.000Z',
        monthlyIncomeKobo: 30_000_000,
      });
      return [200, goalResponse];
    });

    await expect(
      createGoal({
        name: 'Rent',
        amountTotalKobo: 120_000_000,
        dueDate: '2026-12-31T00:00:00.000Z',
        monthlyIncomeKobo: 30_000_000,
      }),
    ).resolves.toEqual(goalResponse);
  });

  it('posts createTransaction payloads and parses the TransactionSchema response', async () => {
    mock.onPost('/transactions').reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({
        direction: 'in',
        amountKobo: 500_000,
        occurredAt: '2026-06-21T12:00:00.000Z',
        note: 'manual entry',
        goalId: 'goal_1',
      });
      return [200, transactionResponse];
    });

    await expect(
      createTransaction({
        direction: 'in',
        amountKobo: 500_000,
        occurredAt: '2026-06-21T12:00:00.000Z',
        note: 'manual entry',
        goalId: 'goal_1',
      }),
    ).resolves.toEqual(transactionResponse);
  });

  it('parses dashboard stability responses for active and missing goals', async () => {
    const stabilityOk = {
      ok: true as const,
      goal: {
        id: 'goal_1',
        name: 'Rent',
        amountTotalKobo: 120_000_000,
        dueDate: '2026-12-31T00:00:00.000Z',
        monthlyIncomeKobo: null,
      },
      metrics: {
        daysRemaining: 120,
        remainingObligationKobo: 60_000_000,
        readinessPct: 50,
        paceRequiredMonthlyKobo: 15_000_000,
        safeToSpendKobo: 10_000_000,
        stabilityScore: 72,
        status: 'stable' as const,
        goalSavedKobo: 60_000_000,
        estimatedBalanceKobo: 70_000_000,
      },
    };

    mock.onGet('/dashboard/stability').replyOnce(200, stabilityOk);
    await expect(getDashboardStability()).resolves.toEqual(stabilityOk);

    mock.onGet('/dashboard/stability').replyOnce(200, {
      ok: false,
      message: 'No active goal found',
    });
    await expect(getDashboardStability()).resolves.toEqual({
      ok: false,
      message: 'No active goal found',
    });
  });

  it('rejects malformed finance responses that fail Zod parsing', async () => {
    mock.onGet('/goals/active').reply(200, {
      id: 'goal_1',
      // missing required GoalSchema fields
      name: 'Rent',
    });

    await expect(getActiveGoal()).rejects.toThrow();

    mock.onPost('/transactions').reply(200, {
      id: 'tx_1',
      userId: 'user_1',
      goalId: null,
      amountKobo: 'not-a-number',
      direction: 'in',
      occurredAt: '2026-06-21T12:00:00.000Z',
      note: null,
      createdAt: '2026-06-21T12:01:00.000Z',
    });

    await expect(
      createTransaction({
        direction: 'in',
        amountKobo: 500_000,
        occurredAt: '2026-06-21T12:00:00.000Z',
      }),
    ).rejects.toThrow();

    mock.onGet('/dashboard/stability').reply(200, {
      ok: true,
      // missing goal + metrics
    });

    await expect(getDashboardStability()).rejects.toThrow();
  });
});
