import { parseTransactionImport } from './transaction-import.parser';

describe('provisional import adapter quoted narration', () => {
  it('keeps escaped quotes in particulars after debit/credit adaptation', () => {
    const [row] = parseTransactionImport(
      [
        'Value Date,Particulars,Debit,Credit',
        '01-09-2026,"He said ""hi""",,5000',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      error: null,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 500_000,
      note: 'He said "hi"',
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
