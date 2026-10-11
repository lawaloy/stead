import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport MAX_SAFE_INTEGER kobo', () => {
  it('accepts the largest kobo value Number can represent exactly', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Ceiling,90071992547409.91,income',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      amountKobo: Number.MAX_SAFE_INTEGER,
      error: null,
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects an amount whose kobo would lose integer precision', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Overflow,90071992547409.92,income',
      ].join('\n'),
    );

    expect(row.amountKobo).toBeNull();
    expect(row.fingerprint).toBeNull();
    expect(row.error).toContain('Amount must be a positive naira value');
  });
});
