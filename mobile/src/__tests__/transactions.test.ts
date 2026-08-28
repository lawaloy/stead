import type { Transaction } from '../contracts/generated/types.gen';
import {
  buildTransactionUpdatePayload,
  calculateNetKobo,
  dateInputToIso,
  filterTransactions,
  formatKoboAsNaira,
  isoToDateInput,
  koboToNairaInput,
  nairaInputToKobo,
} from '../lib/transactions';

const transactions: Transaction[] = [
  {
    id: 'tx_income',
    userId: 'user_1',
    goalId: 'goal_1',
    amountKobo: 250_050,
    direction: 'in',
    occurredAt: '2026-08-20T12:00:00.000Z',
    note: 'Income',
    createdAt: '2026-08-20T12:00:00.000Z',
  },
  {
    id: 'tx_expense',
    userId: 'user_1',
    goalId: null,
    amountKobo: 50_000,
    direction: 'out',
    occurredAt: '2026-08-21T12:00:00.000Z',
    note: 'Expense',
    createdAt: '2026-08-21T12:00:00.000Z',
  },
];

describe('transaction presentation helpers', () => {
  it('filters activity by direction without changing the original order', () => {
    expect(filterTransactions(transactions, 'all')).toEqual(transactions);
    expect(filterTransactions(transactions, 'in').map((row) => row.id)).toEqual(
      ['tx_income'],
    );
    expect(
      filterTransactions(transactions, 'out').map((row) => row.id),
    ).toEqual(['tx_expense']);
  });

  it('calculates the signed net for the visible transactions', () => {
    expect(calculateNetKobo([])).toBe(0);
    expect(calculateNetKobo(transactions)).toBe(200_050);
    expect(calculateNetKobo(filterTransactions(transactions, 'in'))).toBe(
      250_050,
    );
    expect(calculateNetKobo(filterTransactions(transactions, 'out'))).toBe(
      -50_000,
    );
  });

  it('formats kobo as naira for positive and negative totals', () => {
    expect(formatKoboAsNaira(0)).toBe('₦0.00');
    expect(formatKoboAsNaira(250_050)).toBe('₦2,500.50');
    expect(formatKoboAsNaira(-50_000)).toBe('-₦500.00');
  });

  it('converts naira input to safe integer kobo without floating-point rounding', () => {
    expect(nairaInputToKobo('2,500.50')).toBe(250_050);
    expect(nairaInputToKobo(' 1,000.5 ')).toBe(100_050);
    expect(nairaInputToKobo('10')).toBe(1_000);
    expect(nairaInputToKobo('10.5')).toBe(1_050);
    expect(nairaInputToKobo('0.01')).toBe(1);
    expect(nairaInputToKobo('0')).toBeNull();
    expect(nairaInputToKobo('0.00')).toBeNull();
    expect(nairaInputToKobo('')).toBeNull();
    expect(nairaInputToKobo('-10')).toBeNull();
    expect(nairaInputToKobo('10.')).toBeNull();
    expect(nairaInputToKobo('1.234')).toBeNull();
    expect(nairaInputToKobo('not money')).toBeNull();
    expect(nairaInputToKobo('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(nairaInputToKobo('90071992547409.92')).toBeNull();
    expect(nairaInputToKobo('90071992547410')).toBeNull();
  });

  it('converts stored kobo back to an editable naira value', () => {
    expect(koboToNairaInput(1)).toBe('0.01');
    expect(koboToNairaInput(99)).toBe('0.99');
    expect(koboToNairaInput(250_050)).toBe('2500.50');
    expect(koboToNairaInput(250_000)).toBe('2500');
  });

  it('round-trips valid date inputs and rejects impossible dates', () => {
    expect(dateInputToIso('2026-08-21')).toBe('2026-08-21T12:00:00.000Z');
    expect(isoToDateInput('2026-08-21T12:00:00.000Z')).toBe('2026-08-21');
    expect(dateInputToIso('2024-02-29')).toBe('2024-02-29T12:00:00.000Z');
    expect(dateInputToIso('2025-02-29')).toBeNull();
    expect(dateInputToIso('2026-04-31')).toBeNull();
    expect(dateInputToIso('2026-02-30')).toBeNull();
    expect(dateInputToIso('08/21/2026')).toBeNull();
    expect(dateInputToIso('')).toBeNull();
  });

  it('omits goalId on save when the link checkbox did not change', () => {
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '10',
        occurredOn: '2026-08-21',
        note: '  kept  ',
        tagGoal: true,
        wasLinked: true,
        activeGoalId: 'goal_current',
      }),
    ).toEqual({
      direction: 'in',
      amountKobo: 1_000,
      occurredAt: '2026-08-21T12:00:00.000Z',
      note: 'kept',
    });
  });

  it('unlinks or newly links a transaction only when the checkbox changed', () => {
    expect(
      buildTransactionUpdatePayload({
        direction: 'out',
        amountNaira: '50',
        occurredOn: '2026-08-21',
        note: '',
        tagGoal: false,
        wasLinked: true,
        activeGoalId: 'goal_current',
      }),
    ).toEqual({
      direction: 'out',
      amountKobo: 5_000,
      occurredAt: '2026-08-21T12:00:00.000Z',
      note: null,
      goalId: null,
    });

    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '50',
        occurredOn: '2026-08-21',
        note: '   ',
        tagGoal: true,
        wasLinked: false,
        activeGoalId: 'goal_current',
      }),
    ).toEqual({
      direction: 'in',
      amountKobo: 5_000,
      occurredAt: '2026-08-21T12:00:00.000Z',
      note: null,
      goalId: 'goal_current',
    });
  });

  it('rejects an edit payload when the amount or date is invalid', () => {
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '0',
        occurredOn: '2026-08-21',
        note: 'ok',
        tagGoal: false,
        wasLinked: false,
      }),
    ).toBeNull();
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '10',
        occurredOn: '2026-02-30',
        note: 'ok',
        tagGoal: false,
        wasLinked: false,
      }),
    ).toBeNull();
  });
});
