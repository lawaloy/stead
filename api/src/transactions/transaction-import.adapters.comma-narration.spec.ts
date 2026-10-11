import { parseTransactionImport } from './transaction-import.parser';

describe('provisional import adapter comma-containing narration', () => {
  it('keeps comma-containing particulars as one description after adaptation', () => {
    const [row] = parseTransactionImport(
      [
        'Value Date,Particulars,Debit,Credit',
        '01-09-2026,"Rent, August",,5000',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      rowNumber: 2,
      error: null,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 500_000,
      note: 'Rent, August',
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps comma-containing particulars on a debit row', () => {
    const [row] = parseTransactionImport(
      [
        'Posting Date,Details,Debit,Credit',
        '02-09-2026,"Transfer, Lagos",12500.50,',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      error: null,
      direction: 'out',
      amountKobo: 1_250_050,
      note: 'Transfer, Lagos',
    });
  });
});
