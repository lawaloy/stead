import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport closed-quote end of line', () => {
  it('accepts trailing spaces after a closed quoted last field before LF', () => {
    const [row] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,Salary,1000,"income" '].join(
        '\n',
      ),
    );

    expect(row).toMatchObject({
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 100_000,
      note: 'Salary',
      error: null,
    });
  });

  it('accepts trailing spaces after a closed quoted last field before CRLF', () => {
    const [row] = parseTransactionImport(
      'date,description,amount,type\r\n2026-09-01,Salary,1000,"income" \r\n',
    );

    expect(row).toMatchObject({
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 100_000,
      note: 'Salary',
      error: null,
    });
  });
});
