import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport closed-quote whitespace', () => {
  it('accepts RFC-style spaces and tabs after a closing quote before the next delimiter', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,"Salary, August" \t,"NGN 250,000.50" ,credit',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 25_000_050,
      note: 'Salary, August',
      error: null,
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('still parses when the last quoted field ends at EOF without a trailing newline', () => {
    const csv =
      'date,description,amount,type\n2026-09-01,Rent,"1,250.00","out"';
    const [row] = parseTransactionImport(csv);

    expect(row).toMatchObject({
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'out',
      amountKobo: 125_000,
      note: 'Rent',
      error: null,
    });
  });

  it('still rejects non-whitespace characters after a closing quote', () => {
    expect(() =>
      parseTransactionImport(
        [
          'date,description,amount,type',
          '2026-09-01,"oops" extra,10,income',
        ].join('\n'),
      ),
    ).toThrow('Malformed CSV quoting');
  });
});
