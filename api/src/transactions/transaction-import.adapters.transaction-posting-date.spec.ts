import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import Transaction Date over Posting Date', () => {
  it('prefers Transaction Date over Posting Date regardless of column order', () => {
    const rows = [
      parseTransactionImport(
        [
          'Posting Date,Transaction Date,Particulars,Debit,Credit',
          '15/09/2026,01/09/2026,Salary,,250000',
        ].join('\n'),
      )[0],
      parseTransactionImport(
        [
          'Transaction Date,Posting Date,Particulars,Debit,Credit',
          '01/09/2026,15/09/2026,Salary,,250000',
        ].join('\n'),
      )[0],
    ];

    for (const row of rows) {
      expect(row).toMatchObject({
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'in',
        amountKobo: 25_000_000,
        note: 'Salary',
        error: null,
      });
    }
    expect(rows[0].fingerprint).toBe(rows[1].fingerprint);
  });
});
