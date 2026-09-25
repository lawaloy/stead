import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport closed-quote whitespace', () => {
  it('accepts bank-style trailing spaces after a closed quoted field', () => {
    const [row] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,"Salary" ,1000,income'].join(
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

  it('accepts the 500-row import ceiling without rejecting the last row', () => {
    const csv = [
      'date,description,amount,type',
      ...Array.from(
        { length: 500 },
        (_, index) => `2026-09-01,Row ${index},1,income`,
      ),
    ].join('\n');

    const rows = parseTransactionImport(csv);
    expect(rows).toHaveLength(500);
    expect(rows[499]).toMatchObject({
      rowNumber: 501,
      error: null,
      note: 'Row 499',
    });
  });
});
