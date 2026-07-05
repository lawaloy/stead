import { computeStability } from './engine';

describe('computeStability', () => {
  const today = new Date('2026-01-01T00:00:00.000Z');
  const dueInThirtyDays = new Date('2026-01-31T00:00:00.000Z');

  it.each([
    {
      name: 'critical below the warning threshold',
      input: {
        goalTotalKobo: 10_000,
        goalSavedKobo: 2_500,
        dueDate: dueInThirtyDays,
        today,
        estimatedBalanceKobo: 7_250,
      },
      expectedScore: 39,
      expectedStatus: 'critical',
    },
    {
      name: 'warning at the lower warning threshold',
      input: {
        goalTotalKobo: 10_000,
        goalSavedKobo: 2_500,
        dueDate: dueInThirtyDays,
        today,
        estimatedBalanceKobo: 7_500,
      },
      expectedScore: 40,
      expectedStatus: 'warning',
    },
    {
      name: 'stable at the stable threshold',
      input: {
        goalTotalKobo: 10_000,
        goalSavedKobo: 7_500,
        dueDate: dueInThirtyDays,
        today,
        estimatedBalanceKobo: 2_500,
        monthlyIncomeKobo: 1_250,
      },
      expectedScore: 70,
      expectedStatus: 'stable',
    },
  ])('$name', ({ input, expectedScore, expectedStatus }) => {
    expect(computeStability(input)).toMatchObject({
      stabilityScore: expectedScore,
      status: expectedStatus,
    });
  });

  it('clamps overdue and over-saved goals without creating negative obligations', () => {
    const result = computeStability({
      goalTotalKobo: 10_000,
      goalSavedKobo: 12_500,
      dueDate: new Date('2025-12-01T00:00:00.000Z'),
      today,
      estimatedBalanceKobo: 15_000,
      monthlyIncomeKobo: 5_000,
    });

    expect(result).toMatchObject({
      daysRemaining: 0,
      remainingObligationKobo: 0,
      readinessPct: 100,
      paceRequiredMonthlyKobo: 0,
      safeToSpendKobo: 15_000,
      stabilityScore: 80,
      status: 'stable',
    });
  });
});
