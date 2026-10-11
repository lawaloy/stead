import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import adapter unpadded DD-MM dates', () => {
  it('treats 1-9-2026 as 1 September after padding day and month', () => {
    const [row] = parseTransactionImport(
      ['Value Date,Particulars,Debit,Credit', '1-9-2026,Rent,10000,'].join(
        '\n',
      ),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'out',
      amountKobo: 1_000_000,
      note: 'Rent',
      error: null,
    });
    expect(row.fingerprint).not.toBeNull();
  });

  it('treats 1/9/2026 as 1 September, not 9 January', () => {
    const [row] = parseTransactionImport(
      [
        'Transaction Date,Narration,Debit,Credit',
        '1/9/2026,Salary,,"NGN 250,000.00"',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 25_000_000,
      note: 'Salary',
      error: null,
    });
    expect(row.fingerprint).not.toBeNull();
  });

  it('treats 13-1-2026 as 13 January on the dash adapter path', () => {
    const [row] = parseTransactionImport(
      ['Value Date,Particulars,Debit,Credit', '13-1-2026,Salary,,250000'].join(
        '\n',
      ),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      occurredAt: '2026-01-13T12:00:00.000Z',
      direction: 'in',
      amountKobo: 25_000_000,
      note: 'Salary',
      error: null,
    });
    expect(row.fingerprint).not.toBeNull();
  });
});
