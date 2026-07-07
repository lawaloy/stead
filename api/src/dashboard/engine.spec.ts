import { computeStability } from './engine';

describe('computeStability', () => {
  const today = new Date('2026-01-01T00:00:00.000Z');

  it('computes warning metrics for a partially funded goal with some buffer', () => {
    const result = computeStability({
      goalTotalKobo: 100_000,
      goalSavedKobo: 25_000,
      dueDate: new Date('2026-01-31T00:00:00.000Z'),
      today,
      estimatedBalanceKobo: 120_000,
      monthlyIncomeKobo: 50_000,
    });

    expect(result).toEqual({
      daysRemaining: 30,
      remainingObligationKobo: 75_000,
      readinessPct: 25,
      paceRequiredMonthlyKobo: 75_000,
      safeToSpendKobo: 45_000,
      stabilityScore: 59,
      status: 'warning',
    });
  });

  it('treats an overfunded goal as stable with no remaining obligation', () => {
    const result = computeStability({
      goalTotalKobo: 100_000,
      goalSavedKobo: 125_000,
      dueDate: new Date('2026-02-01T00:00:00.000Z'),
      today,
      estimatedBalanceKobo: 20_000,
      monthlyIncomeKobo: null,
    });

    expect(result.remainingObligationKobo).toBe(0);
    expect(result.readinessPct).toBe(100);
    expect(result.paceRequiredMonthlyKobo).toBe(0);
    expect(result.safeToSpendKobo).toBe(20_000);
    expect(result.stabilityScore).toBe(80);
    expect(result.status).toBe('stable');
  });

  it('uses the full remaining obligation as pace when the goal is due today', () => {
    const result = computeStability({
      goalTotalKobo: 100_000,
      goalSavedKobo: 40_000,
      dueDate: today,
      today,
      estimatedBalanceKobo: 10_000,
      monthlyIncomeKobo: 0,
    });

    expect(result.daysRemaining).toBe(0);
    expect(result.remainingObligationKobo).toBe(60_000);
    expect(result.paceRequiredMonthlyKobo).toBe(60_000);
    expect(result.safeToSpendKobo).toBe(0);
    expect(result.stabilityScore).toBe(21);
    expect(result.status).toBe('critical');
  });

  it('clamps negative goal totals and saved amounts before scoring', () => {
    const result = computeStability({
      goalTotalKobo: -100_000,
      goalSavedKobo: -25_000,
      dueDate: new Date('2026-01-02T00:00:00.000Z'),
      today,
      estimatedBalanceKobo: 5_000,
      monthlyIncomeKobo: null,
    });

    expect(result.remainingObligationKobo).toBe(0);
    expect(result.readinessPct).toBe(0);
    expect(result.paceRequiredMonthlyKobo).toBe(0);
    expect(result.safeToSpendKobo).toBe(5_000);
  });
});
