import { parseTransactionImport } from './transaction-import.parser';

describe('provisional import adapter unquoted debit thousands separators', () => {
  it('invalidates a row when an unquoted comma-grouped debit splits across columns', () => {
    const [row] = parseTransactionImport(
      ['Posting Date,Details,Debit,Credit', '02-09-2026,Salary,1,250.50,'].join(
        '\n',
      ),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      fingerprint: null,
      amountKobo: null,
      direction: null,
      error: expect.stringContaining(
        'Type must be income, expense, credit, or debit',
      ) as unknown,
    });
    expect(row.error).toEqual(
      expect.stringContaining('Amount must be a positive naira value'),
    );
  });

  it('imports a quoted comma-grouped debit as one outgoing amount', () => {
    const [row] = parseTransactionImport(
      [
        'Posting Date,Details,Debit,Credit',
        '02-09-2026,Salary,"1,250.50",',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      error: null,
      occurredAt: '2026-09-02T12:00:00.000Z',
      direction: 'out',
      amountKobo: 125_050,
      note: 'Salary',
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
