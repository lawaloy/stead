import type {
  Transaction,
  UpdateTransactionRequest,
} from '../contracts/generated/types.gen';

export type TransactionFilter = 'all' | Transaction['direction'];

export const filterTransactions = (
  transactions: Transaction[],
  filter: TransactionFilter,
) =>
  filter === 'all'
    ? transactions
    : transactions.filter((transaction) => transaction.direction === filter);

export const calculateNetKobo = (transactions: Transaction[]) =>
  transactions.reduce(
    (total, transaction) =>
      total +
      (transaction.direction === 'in'
        ? transaction.amountKobo
        : -transaction.amountKobo),
    0,
  );

export const formatKoboAsNaira = (amountKobo: number) => {
  const absolute = Math.abs(amountKobo) / 100;
  const sign = amountKobo < 0 ? '-' : '';
  return `${sign}\u20a6${absolute.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatTransactionDate = (occurredAt: string) =>
  new Date(occurredAt).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const datePartsToInput = (date: Date) =>
  [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

export const todayDateInput = (now = new Date()) => datePartsToInput(now);

export const isoToDateInput = (occurredAt: string) =>
  datePartsToInput(new Date(occurredAt));

export const dateInputToIso = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
};

export const resolveTransactionGoalId = (
  currentGoalId: string | null,
  tagGoal: boolean,
  activeGoalId: string | null,
) => (tagGoal ? (activeGoalId ?? currentGoalId) : null);

export const koboToNairaInput = (amountKobo: number) => {
  const whole = Math.trunc(amountKobo / 100);
  const fraction = Math.abs(amountKobo % 100);
  return fraction === 0
    ? String(whole)
    : `${whole}.${String(fraction).padStart(2, '0')}`;
};

export const nairaInputToKobo = (value: string) => {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  return Number(amount);
};

export type TransactionUpdateForm = {
  direction: Transaction['direction'];
  amountNaira: string;
  occurredOn: string;
  note: string;
  tagGoal: boolean;
  currentGoalId: string | null;
  activeGoalId?: string;
};

export const buildTransactionUpdatePayload = (
  form: TransactionUpdateForm,
): UpdateTransactionRequest | null => {
  const amountKobo = nairaInputToKobo(form.amountNaira);
  const occurredAt = dateInputToIso(form.occurredOn);
  if (amountKobo === null || occurredAt === null) return null;

  const payload: UpdateTransactionRequest = {
    direction: form.direction,
    amountKobo,
    occurredAt,
    note: form.note.trim() || null,
  };
  const targetGoalId = resolveTransactionGoalId(
    form.currentGoalId,
    form.tagGoal,
    form.activeGoalId ?? null,
  );
  if (targetGoalId !== form.currentGoalId) {
    payload.goalId = targetGoalId;
  }
  return payload;
};
