import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport one-decimal and minimum kobo amounts', () => {
  it('pads a single fractional digit to kobo instead of concatenating it as tens', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Partial naira,1.2,expense',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      amountKobo: 120,
      error: null,
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
    });
  });

  it('accepts the smallest positive naira amount as 1 kobo', () => {
    const [row] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,Minimum,0.01,income'].join(
        '\n',
      ),
    );

    expect(row).toMatchObject({
      amountKobo: 1,
      direction: 'in',
      error: null,
    });
  });
});
