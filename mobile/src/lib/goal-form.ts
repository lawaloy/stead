import type { CreateGoalRequest } from '../contracts/generated/types.gen';

export type GoalFormFields = {
  name: string;
  amountKobo: string;
  dueDate: string;
  monthlyIncomeKobo: string;
};

export const goalFormValidationError = (fields: GoalFormFields): string => {
  if (!fields.name.trim()) return 'Goal name is required';
  if (!/^\d+$/.test(fields.amountKobo) || Number(fields.amountKobo) <= 0) {
    return 'amountTotalKobo must be > 0';
  }
  if (Number.isNaN(Date.parse(fields.dueDate))) {
    return 'dueDate must be a valid ISO date';
  }
  if (
    fields.monthlyIncomeKobo &&
    (!/^\d+$/.test(fields.monthlyIncomeKobo) ||
      Number(fields.monthlyIncomeKobo) < 0)
  ) {
    return 'monthlyIncomeKobo must be >= 0';
  }
  return '';
};

export const buildCreateGoalPayload = (
  fields: GoalFormFields,
): CreateGoalRequest | null => {
  if (goalFormValidationError(fields)) return null;

  const payload: CreateGoalRequest = {
    name: fields.name.trim(),
    amountTotalKobo: Number(fields.amountKobo),
    dueDate: fields.dueDate,
  };
  if (fields.monthlyIncomeKobo) {
    payload.monthlyIncomeKobo = Number(fields.monthlyIncomeKobo);
  }
  return payload;
};
