import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport description whitespace fingerprints', () => {
  it('collapses internal whitespace so padded bank narrations share a fingerprint', () => {
    const padded = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Rent  buffer,100,expense',
        '2026-09-01,Rent\tbuffer,100,EXPENSE',
      ].join('\n'),
    );
    const [collapsed] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,Rent buffer,100,out'].join(
        '\n',
      ),
    );

    expect(padded[0].note).toBe('Rent buffer');
    expect(padded[1].note).toBe('Rent buffer');
    expect(padded[0].fingerprint).toBe(collapsed.fingerprint);
    expect(padded[1].fingerprint).not.toBe(padded[0].fingerprint);
    expect(padded.every((row) => row.error === null)).toBe(true);
  });
});
