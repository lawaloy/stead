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

export const isoToDateInput = (occurredAt: string) => occurredAt.slice(0, 10);

export const dateInputToIso = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T12:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date.toISOString();
};

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
  wasLinked: boolean;
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
  if (form.tagGoal !== form.wasLinked) {
    payload.goalId = form.tagGoal ? form.activeGoalId : null;
  }
  return payload;
};
