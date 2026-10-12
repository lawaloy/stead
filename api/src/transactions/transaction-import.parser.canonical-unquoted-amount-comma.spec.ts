import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport canonical unquoted amount commas', () => {
  it('invalidates a row when an unquoted comma-grouped amount splits across columns', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Salary,1,250.50,income',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      fingerprint: null,
      direction: null,
      error: expect.stringContaining(
        'Type must be income, expense, credit, or debit',
      ) as unknown,
    });
  });

  it('invalidates a short row that omitted trailing columns', () => {
    const [row] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,Salary'].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      fingerprint: null,
      amountKobo: null,
      direction: null,
    });
    expect(row.error).toEqual(
      expect.stringContaining('Type must be income, expense, credit, or debit'),
    );
    expect(row.error).toEqual(
      expect.stringContaining('Amount must be a positive naira value'),
    );
  });

  it('imports a quoted comma-grouped amount as one incoming value', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Salary,"1,250.50",income',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      error: null,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 125_050,
      note: 'Salary',
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
