import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import adapter zero debit/credit cells', () => {
  it('treats a lone 0 debit as filled and rejects the non-positive amount', () => {
    const [row] = parseTransactionImport(
      ['date,narration,debit,credit', '2026-09-01,Zero debit,0,'].join('\n'),
    );

    expect(row.direction).toBe('out');
    expect(row.amountKobo).toBeNull();
    expect(row.fingerprint).toBeNull();
    expect(row.error).toContain('Amount must be a positive naira value');
    expect(row.error).not.toContain('Type must be');
  });

  it('treats a lone 0.00 credit as filled and rejects the non-positive amount', () => {
    const [row] = parseTransactionImport(
      ['date,narration,debit,credit', '2026-09-01,Zero credit,,0.00'].join(
        '\n',
      ),
    );

    expect(row.direction).toBe('in');
    expect(row.amountKobo).toBeNull();
    expect(row.fingerprint).toBeNull();
    expect(row.error).toContain('Amount must be a positive naira value');
    expect(row.error).not.toContain('Type must be');
  });
});
