export type StabilityStatus = 'stable' | 'warning' | 'critical';

export interface StabilityInputs {
  goalTotalKobo: number;
  goalSavedKobo: number;
  dueDate: Date;
  today: Date;
  estimatedBalanceKobo: number;
  monthlyIncomeKobo?: number | null;
}

export interface StabilityOutput {
  daysRemaining: number;
  remainingObligationKobo: number;
  readinessPct: number;
  paceRequiredMonthlyKobo: number;
  safeToSpendKobo: number;
  stabilityScore: number;
  status: StabilityStatus;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function computeStability(input: StabilityInputs): StabilityOutput {
  const goalTotal = Math.max(0, input.goalTotalKobo);
  const saved = Math.max(0, input.goalSavedKobo);
  const balance = input.estimatedBalanceKobo;

  const diffMs = input.dueDate.getTime() - input.today.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const remainingObligationKobo = Math.max(0, goalTotal - saved);

  const readinessRatio = goalTotal > 0 ? clamp(saved / goalTotal, 0, 1) : 0;
  const readinessPct = Number((readinessRatio * 100).toFixed(1));

  const paceRequiredMonthlyKobo =
    daysRemaining > 0
      ? Math.ceil(remainingObligationKobo / Math.max(daysRemaining / 30, 1 / 30))
      : remainingObligationKobo;

  const safeToSpendKobo = Math.max(0, balance - remainingObligationKobo);
  const coverageRatio =
    remainingObligationKobo === 0
      ? 1
      : clamp(balance / Math.max(remainingObligationKobo, 1), 0, 1);
  const incomeSupportRatio =
    input.monthlyIncomeKobo && paceRequiredMonthlyKobo > 0
      ? clamp(input.monthlyIncomeKobo / paceRequiredMonthlyKobo, 0, 1)
      : 0;
  const bufferRatio =
    remainingObligationKobo > 0
      ? clamp(safeToSpendKobo / remainingObligationKobo, 0, 1)
      : 1;

  const stabilityScore = Math.round(
    readinessRatio * 40 + coverageRatio * 30 + incomeSupportRatio * 20 + bufferRatio * 10,
  );

  const status: StabilityStatus =
    stabilityScore >= 70 ? 'stable' : stabilityScore >= 40 ? 'warning' : 'critical';

  return {
    daysRemaining,
    remainingObligationKobo,
    readinessPct,
    paceRequiredMonthlyKobo,
    safeToSpendKobo,
    stabilityScore,
    status,
  };
}
