import { computeStability } from './engine';

describe('computeStability', () => {
  const today = new Date('2026-01-01T00:00:00.000Z');
  const dueInThirtyDays = new Date('2026-01-31T00:00:00.000Z');

  it('computes warning metrics for a partially funded goal with some buffer', () => {
    const result = computeStability({
      goalTotalKobo: 100_000,
      goalSavedKobo: 25_000,
      dueDate: dueInThirtyDays,
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

  it('annualizes pace with the 1/30 floor when only one day remains', () => {
    const result = computeStability({
      goalTotalKobo: 100_000,
      goalSavedKobo: 40_000,
      dueDate: new Date('2026-01-02T00:00:00.000Z'),
      today,
      estimatedBalanceKobo: 10_000,
      monthlyIncomeKobo: 50_000,
    });

    // daysRemaining=1 → divisor max(1/30, 1/30)=1/30 → ceil(60_000 / (1/30)) = 1_800_000
    expect(result.daysRemaining).toBe(1);
    expect(result.remainingObligationKobo).toBe(60_000);
    expect(result.paceRequiredMonthlyKobo).toBe(1_800_000);
    expect(result.safeToSpendKobo).toBe(0);
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

  it('treats a zero goal total as zero readiness without dividing by zero', () => {
    const result = computeStability({
      goalTotalKobo: 0,
      goalSavedKobo: 5_000,
      dueDate: dueInThirtyDays,
      today,
      estimatedBalanceKobo: 10_000,
      monthlyIncomeKobo: 2_000,
    });

    expect(result.remainingObligationKobo).toBe(0);
    expect(result.readinessPct).toBe(0);
    expect(result.paceRequiredMonthlyKobo).toBe(0);
    expect(result.safeToSpendKobo).toBe(10_000);
    expect(Number.isFinite(result.stabilityScore)).toBe(true);
    expect(result.stabilityScore).toBe(40);
    expect(result.status).toBe('warning');
  });

  it('never reports negative safe-to-spend when estimated balance is negative', () => {
    const result = computeStability({
      goalTotalKobo: 100_000,
      goalSavedKobo: 20_000,
      dueDate: dueInThirtyDays,
      today,
      estimatedBalanceKobo: -15_000,
      monthlyIncomeKobo: null,
    });

    expect(result.remainingObligationKobo).toBe(80_000);
    expect(result.readinessPct).toBe(20);
    expect(result.safeToSpendKobo).toBe(0);
    expect(result.stabilityScore).toBe(8);
    expect(result.status).toBe('critical');
  });
});
