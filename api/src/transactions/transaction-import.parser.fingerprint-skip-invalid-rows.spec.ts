import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport fingerprint occurrence across invalid rows', () => {
  it('does not let an invalid row consume the occurrence index of identical valid rows', () => {
    const interrupted = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Transfer,5000,income',
        '09/01/2026,Transfer,5000,income',
        '2026-09-01,Transfer,5000,income',
      ].join('\n'),
    );
    const consecutive = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Transfer,5000,income',
        '2026-09-01,Transfer,5000,income',
      ].join('\n'),
    );

    expect(interrupted[0].error).toBeNull();
    expect(interrupted[1].error).toContain('Date must use YYYY-MM-DD');
    expect(interrupted[1].fingerprint).toBeNull();
    expect(interrupted[2].error).toBeNull();
    expect(interrupted[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(interrupted[2].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(interrupted[2].fingerprint).not.toBe(interrupted[0].fingerprint);
    expect(interrupted[0].fingerprint).toBe(consecutive[0].fingerprint);
    expect(interrupted[2].fingerprint).toBe(consecutive[1].fingerprint);
  });
});
