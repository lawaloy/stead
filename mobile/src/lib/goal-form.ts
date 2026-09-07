import type {
  CreateGoalRequest,
  Goal,
  UpdateGoalRequest,
} from '../contracts/generated/types.gen';
import {
  dateInputToIso,
  koboToNairaInput,
  nairaInputToKobo,
} from './transactions';

export type GoalFormFields = {
  name: string;
  amountNaira: string;
  dueOn: string;
  monthlyIncomeNaira: string;
};

const optionalNairaInputToKobo = (value: string) => {
  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(amount);
};

export const goalFormValidationError = (fields: GoalFormFields): string => {
  if (!fields.name.trim()) return 'Goal name is required';
  if (nairaInputToKobo(fields.amountNaira) === null) {
    return 'Enter a goal amount greater than zero';
  }
  if (dateInputToIso(fields.dueOn) === null) {
    return 'Enter a valid due date as YYYY-MM-DD';
  }
  if (optionalNairaInputToKobo(fields.monthlyIncomeNaira) === null) {
    return 'Enter a valid monthly income or leave it blank';
  }
  return '';
};

const buildGoalFields = (fields: GoalFormFields) => {
  if (goalFormValidationError(fields)) return null;

  const amountTotalKobo = nairaInputToKobo(fields.amountNaira);
  const dueDate = dateInputToIso(fields.dueOn);
  const monthlyIncomeKobo = optionalNairaInputToKobo(fields.monthlyIncomeNaira);
  if (
    amountTotalKobo === null ||
    dueDate === null ||
    monthlyIncomeKobo === null
  ) {
    return null;
  }

  return {
    name: fields.name.trim(),
    amountTotalKobo,
    dueDate,
    monthlyIncomeKobo,
  };
};

export const buildCreateGoalPayload = (
  fields: GoalFormFields,
): CreateGoalRequest | null => {
  const parsed = buildGoalFields(fields);
  if (!parsed) return null;
  const { monthlyIncomeKobo, ...required } = parsed;
  return monthlyIncomeKobo === undefined
    ? required
    : { ...required, monthlyIncomeKobo };
};

export const buildUpdateGoalPayload = (
  fields: GoalFormFields,
): UpdateGoalRequest | null => {
  const parsed = buildGoalFields(fields);
  return parsed
    ? { ...parsed, monthlyIncomeKobo: parsed.monthlyIncomeKobo ?? null }
    : null;
};

export const goalToFormFields = (goal: Goal): GoalFormFields => ({
  name: goal.name,
  amountNaira: koboToNairaInput(goal.amountTotalKobo),
  dueOn: goal.dueDate.slice(0, 10),
  monthlyIncomeNaira:
    goal.monthlyIncomeKobo === null
      ? ''
      : koboToNairaInput(goal.monthlyIncomeKobo),
});
