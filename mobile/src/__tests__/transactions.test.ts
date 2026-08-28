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
  resolveTransactionGoalId,
  todayDateInput,
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

  it('round-trips calendar dates through a stable UTC anchor', () => {
    const occurredAt = dateInputToIso('2026-08-21');
    expect(occurredAt).toBe('2026-08-21T12:00:00.000Z');
    expect(isoToDateInput(occurredAt as string)).toBe('2026-08-21');
    expect(isoToDateInput('2026-08-21T23:30:00.000Z')).toBe('2026-08-21');
    expect(isoToDateInput(dateInputToIso('2024-02-29') as string)).toBe(
      '2024-02-29',
    );
    expect(dateInputToIso('2025-02-29')).toBeNull();
    expect(dateInputToIso('2026-04-31')).toBeNull();
    expect(dateInputToIso('2026-02-30')).toBeNull();
    expect(dateInputToIso('08/21/2026')).toBeNull();
    expect(dateInputToIso('')).toBeNull();
  });

  it('omits goalId on save when the target goal did not change', () => {
    const occurredAt = dateInputToIso('2026-08-21');
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '10',
        occurredOn: '2026-08-21',
        note: '  kept  ',
        tagGoal: true,
        goalSelectionChanged: false,
        currentGoalId: 'goal_current',
        activeGoalId: 'goal_current',
      }),
    ).toEqual({
      direction: 'in',
      amountKobo: 1_000,
      occurredAt,
      note: 'kept',
    });
  });

  it('unlinks or newly links a transaction only when the checkbox changed', () => {
    const occurredAt = dateInputToIso('2026-08-21');
    expect(
      buildTransactionUpdatePayload({
        direction: 'out',
        amountNaira: '50',
        occurredOn: '2026-08-21',
        note: '',
        tagGoal: false,
        goalSelectionChanged: true,
        currentGoalId: 'goal_current',
        activeGoalId: 'goal_current',
      }),
    ).toEqual({
      direction: 'out',
      amountKobo: 5_000,
      occurredAt,
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
        goalSelectionChanged: true,
        currentGoalId: null,
        activeGoalId: 'goal_current',
      }),
    ).toEqual({
      direction: 'in',
      amountKobo: 5_000,
      occurredAt,
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
        goalSelectionChanged: false,
        currentGoalId: null,
      }),
    ).toBeNull();
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '10',
        occurredOn: '2026-02-30',
        note: 'ok',
        tagGoal: false,
        goalSelectionChanged: false,
        currentGoalId: null,
      }),
    ).toBeNull();
  });

  it('rejects an explicit goal reassignment until the active goal is loaded', () => {
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '10',
        occurredOn: '2026-08-21',
        note: 'reassign after load',
        tagGoal: true,
        goalSelectionChanged: true,
        currentGoalId: 'goal_old',
      }),
    ).toBeNull();
  });

  it('uses the device-local day when initializing a new transaction', () => {
    const localDate = new Date(2026, 7, 21, 23, 30);
    expect(todayDateInput(localDate)).toBe('2026-08-21');
  });

  it('preserves an older goal until the customer explicitly changes the selection', () => {
    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '10',
        occurredOn: '2026-08-21',
        note: 'note only',
        tagGoal: true,
        goalSelectionChanged: false,
        currentGoalId: 'goal_old',
        activeGoalId: 'goal_active',
      }),
    ).not.toHaveProperty('goalId');

    expect(
      buildTransactionUpdatePayload({
        direction: 'in',
        amountNaira: '10',
        occurredOn: '2026-08-21',
        note: 'reassigned',
        tagGoal: true,
        goalSelectionChanged: true,
        currentGoalId: 'goal_old',
        activeGoalId: 'goal_active',
      }),
    ).toMatchObject({ goalId: 'goal_active' });
    expect(resolveTransactionGoalId('goal_old', true, 'goal_active')).toBe(
      'goal_active',
    );
    expect(resolveTransactionGoalId('goal_old', true, null)).toBe('goal_old');
    expect(
      resolveTransactionGoalId('goal_old', false, 'goal_active'),
    ).toBeNull();
  });
});
