import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport padded calendar date cells', () => {
  it('accepts a canonical ISO date cell with surrounding whitespace', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        ' 2026-09-01 ,Salary,2500.50,income',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 250_050,
      note: 'Salary',
      error: null,
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts a provisional slash date cell with surrounding whitespace', () => {
    const [row] = parseTransactionImport(
      [
        'Value Date,Particulars,Debit,Credit',
        ' 01/09/2026 ,Salary,,"2500.50"',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 250_050,
      note: 'Salary',
      error: null,
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
