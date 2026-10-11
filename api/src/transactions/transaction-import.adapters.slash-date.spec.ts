import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import adapter day/month slash dates', () => {
  it('treats 13/01/2026 as 13 January, not an invalid US-style month', () => {
    const [row] = parseTransactionImport(
      [
        'Transaction Date,Narration,Debit,Credit',
        '13/01/2026,Salary,,"NGN 250,000.00"',
      ].join('\n'),
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

  it('rejects 01/13/2026 after adapting it to an impossible ISO month', () => {
    const [row] = parseTransactionImport(
      [
        'Transaction Date,Narration,Debit,Credit',
        '01/13/2026,Salary,,"NGN 250,000.00"',
      ].join('\n'),
    );

    expect(row.occurredAt).toBeNull();
    expect(row.fingerprint).toBeNull();
    expect(row.error).toContain('Date must use YYYY-MM-DD');
  });

  it('rejects adapted DD-MM-YYYY dates that are not real calendar days', () => {
    const [row] = parseTransactionImport(
      ['Value Date,Particulars,Debit,Credit', '31-02-2026,Rent,10000,'].join(
        '\n',
      ),
    );

    expect(row.occurredAt).toBeNull();
    expect(row.fingerprint).toBeNull();
    expect(row.error).toContain('Date must use YYYY-MM-DD');
  });
});
