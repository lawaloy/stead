import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport classic Mac CR line endings', () => {
  it('splits statement rows on CR-only line endings', () => {
    const rows = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-08-31,Salary,250000.50,credit',
        '2026-09-01,Groceries,1250,debit',
      ].join('\r'),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        occurredAt: '2026-08-31T12:00:00.000Z',
        direction: 'in',
        amountKobo: 25_000_050,
        note: 'Salary',
        error: null,
      }),
      expect.objectContaining({
        rowNumber: 3,
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'out',
        amountKobo: 125_000,
        note: 'Groceries',
        error: null,
      }),
    ]);
    expect(rows[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[1].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].fingerprint).not.toBe(rows[1].fingerprint);
  });
});
