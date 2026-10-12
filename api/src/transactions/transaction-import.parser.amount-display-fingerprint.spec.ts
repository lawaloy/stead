import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport amount display fingerprints', () => {
  it('treats equivalent naira spellings as the same fingerprint occurrence sequence', () => {
    const mixed = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Transfer,1000,income',
        '2026-09-01,Transfer,"1,000.00",IN',
        '2026-09-01,Transfer,NGN 1000,in',
      ].join('\n'),
    );
    const [single] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Transfer,1000.00,credit',
      ].join('\n'),
    );

    expect(mixed.map((row) => row.amountKobo)).toEqual([
      100_000, 100_000, 100_000,
    ]);
    expect(single.amountKobo).toBe(100_000);
    expect(mixed[0].fingerprint).toBe(single.fingerprint);
    expect(mixed[1].fingerprint).not.toBe(mixed[0].fingerprint);
    expect(mixed[2].fingerprint).not.toBe(mixed[0].fingerprint);
    expect(mixed[2].fingerprint).not.toBe(mixed[1].fingerprint);
    expect(mixed.every((row) => row.error === null)).toBe(true);
  });
});
