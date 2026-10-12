import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport en-NG description fingerprints', () => {
  it('does not treat dotted capital I as the same narration as ASCII I', () => {
    const [dotted] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,İSTANBUL,100,income'].join(
        '\n',
      ),
    );
    const [ascii] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,ISTANBUL,100,income'].join(
        '\n',
      ),
    );

    expect(dotted.error).toBeNull();
    expect(ascii.error).toBeNull();
    expect(dotted.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(ascii.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(dotted.fingerprint).not.toBe(ascii.fingerprint);
  });

  it('keeps dotted-I narrations on one occurrence sequence across repeat parses', () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-01,İstanbul,100,income',
      '2026-09-01,İSTANBUL,100,IN',
    ].join('\n');
    const first = parseTransactionImport(csv);
    const second = parseTransactionImport(csv);

    expect(first[0].fingerprint).not.toBe(first[1].fingerprint);
    expect(first.map((row) => row.fingerprint)).toEqual(
      second.map((row) => row.fingerprint),
    );
    expect(first.every((row) => row.error === null)).toBe(true);
  });
});
