import {
  AuthCountriesResponseSchema,
  AuthRequestOtpResponseSchema,
  AuthVerifyOtpResponseSchema,
  DashboardStabilityResponseSchema,
  GoalSchema,
  TransactionSchema,
} from '../types/api';

describe('api response contract shapes', () => {
  it('accepts auth otp responses with and without a dev otp hint', () => {
    expect(AuthRequestOtpResponseSchema.parse({ ok: true })).toEqual({
      ok: true,
    });
    expect(
      AuthRequestOtpResponseSchema.parse({ ok: true, otp: '123456' }),
    ).toEqual({ ok: true, otp: '123456' });
    expect(AuthVerifyOtpResponseSchema.parse({ token: 'jwt-token' })).toEqual({
      token: 'jwt-token',
    });
  });

  it('accepts auth countries with Nigeria marked as default market', () => {
    expect(
      AuthCountriesResponseSchema.parse({
        countries: [
          {
            iso: 'NG',
            label: 'Nigeria',
            dialCode: '+234',
            currencyCode: 'NGN',
            phoneExample: '08012345678',
            authEnabled: true,
            marketEnabled: true,
            defaultCountry: true,
          },
        ],
      }),
    ).toEqual({
      countries: [
        {
          iso: 'NG',
          label: 'Nigeria',
          dialCode: '+234',
          currencyCode: 'NGN',
          phoneExample: '08012345678',
          authEnabled: true,
          marketEnabled: true,
          defaultCountry: true,
        },
      ],
    });
  });

  it('accepts goal and transaction responses returned by the api serializers', () => {
    expect(
      GoalSchema.parse({
        id: 'goal_1',
        userId: 'user_1',
        name: 'Rent',
        amountTotalKobo: 120000000,
        dueDate: '2026-12-31T00:00:00.000Z',
        monthlyIncomeKobo: 30000000,
        isActive: true,
        createdAt: '2026-06-21T12:00:00.000Z',
      }),
    ).toMatchObject({
      id: 'goal_1',
      amountTotalKobo: 120000000,
      monthlyIncomeKobo: 30000000,
    });

    expect(
      TransactionSchema.parse({
        id: 'tx_1',
        userId: 'user_1',
        goalId: 'goal_1',
        amountKobo: 500000,
        direction: 'in',
        occurredAt: '2026-06-21T12:00:00.000Z',
        note: 'manual entry',
        createdAt: '2026-06-21T12:01:00.000Z',
      }),
    ).toMatchObject({
      id: 'tx_1',
      direction: 'in',
      amountKobo: 500000,
    });
  });

  it('accepts dashboard stability responses for active and missing goals', () => {
    expect(
      DashboardStabilityResponseSchema.parse({
        ok: true,
        goal: {
          id: 'goal_1',
          name: 'Rent',
          amountTotalKobo: 120000000,
          dueDate: '2026-12-31T00:00:00.000Z',
          monthlyIncomeKobo: null,
        },
        metrics: {
          daysRemaining: 120,
          remainingObligationKobo: 60000000,
          readinessPct: 50,
          paceRequiredMonthlyKobo: 15000000,
          safeToSpendKobo: 10000000,
          stabilityScore: 72,
          status: 'stable',
          goalSavedKobo: 60000000,
          estimatedBalanceKobo: 70000000,
        },
      }),
    ).toMatchObject({
      ok: true,
      metrics: {
        status: 'stable',
      },
    });

    expect(
      DashboardStabilityResponseSchema.parse({
        ok: false,
        message: 'No active goal found',
      }),
    ).toEqual({ ok: false, message: 'No active goal found' });
  });
});
