import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import conflicting provisional headers', () => {
  it('prefers Value Date over Posting Date regardless of column order', () => {
    const rows = [
      parseTransactionImport(
        [
          'Posting Date,Value Date,Particulars,Debit,Credit',
          '15/09/2026,01/09/2026,Salary,,250000',
        ].join('\n'),
      )[0],
      parseTransactionImport(
        [
          'Value Date,Posting Date,Particulars,Debit,Credit',
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

  it('prefers Narration over Particulars regardless of column order', () => {
    const rows = [
      parseTransactionImport(
        [
          'Value Date,Particulars,Narration,Debit,Credit',
          '01/09/2026,Customer text,Bank memo,12500,',
        ].join('\n'),
      )[0],
      parseTransactionImport(
        [
          'Value Date,Narration,Particulars,Debit,Credit',
          '01/09/2026,Bank memo,Customer text,12500,',
        ].join('\n'),
      )[0],
    ];

    for (const row of rows) {
      expect(row).toMatchObject({
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'out',
        amountKobo: 1_250_000,
        note: 'Bank memo',
        error: null,
      });
    }
    expect(rows[0].fingerprint).toBe(rows[1].fingerprint);
  });

  it('prefers Transaction Date over Value Date regardless of column order', () => {
    const rows = [
      parseTransactionImport(
        [
          'Value Date,Transaction Date,Particulars,Debit,Credit',
          '15/09/2026,01/09/2026,Salary,,250000',
        ].join('\n'),
      )[0],
      parseTransactionImport(
        [
          'Transaction Date,Value Date,Particulars,Debit,Credit',
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

  it('prefers Description over Narration regardless of column order', () => {
    const rows = [
      parseTransactionImport(
        [
          'Value Date,Narration,Description,Debit,Credit',
          '01/09/2026,Bank memo,Customer text,12500,',
        ].join('\n'),
      )[0],
      parseTransactionImport(
        [
          'Value Date,Description,Narration,Debit,Credit',
          '01/09/2026,Customer text,Bank memo,12500,',
        ].join('\n'),
      )[0],
    ];

    for (const row of rows) {
      expect(row).toMatchObject({
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'out',
        amountKobo: 1_250_000,
        note: 'Customer text',
        error: null,
      });
    }
    expect(rows[0].fingerprint).toBe(rows[1].fingerprint);
  });
});
