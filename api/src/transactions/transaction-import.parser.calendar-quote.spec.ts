import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport calendar and quote edges', () => {
  it('accepts a valid Gregorian leap day instead of overflowing to March', () => {
    const [row] = parseTransactionImport(
      ['date,description,amount,type', '2024-02-29,Leap bonus,250,income'].join(
        '\n',
      ),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      occurredAt: '2024-02-29T12:00:00.000Z',
      direction: 'in',
      amountKobo: 25_000,
      note: 'Leap bonus',
      error: null,
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts a description at the 280-character limit', () => {
    const note = 'x'.repeat(280);
    const [row] = parseTransactionImport(
      ['date,description,amount,type', `2026-09-01,"${note}",10,expense`].join(
        '\n',
      ),
    );

    expect(row).toMatchObject({
      note,
      amountKobo: 1_000,
      error: null,
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('unescapes doubled quotes inside a quoted bank description', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,"He said ""hi""",0.01,expense',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'out',
      amountKobo: 1,
      note: 'He said "hi"',
      error: null,
    });
  });
});
