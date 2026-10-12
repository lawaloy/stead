import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport description length after whitespace collapse', () => {
  it('accepts a padded bank narration that collapses to exactly 280 characters', () => {
    const padded = `${'x'.repeat(139)}   ${'x'.repeat(140)}`;
    expect(padded).toHaveLength(282);

    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        `2026-09-01,"${padded}",10,expense`,
      ].join('\n'),
    );

    expect(row.note).toBe(`${'x'.repeat(139)} ${'x'.repeat(140)}`);
    expect(row.note).toHaveLength(280);
    expect(row).toMatchObject({
      amountKobo: 1_000,
      error: null,
    });
    expect(row.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('still rejects a padded narration that remains over 280 characters after collapse', () => {
    const padded = `${'x'.repeat(140)}   ${'x'.repeat(140)}`;
    expect(padded).toHaveLength(283);

    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        `2026-09-01,"${padded}",10,expense`,
      ].join('\n'),
    );

    expect(row.note).toHaveLength(281);
    expect(row.error).toContain('Description cannot exceed 280 characters');
    expect(row.fingerprint).toBeNull();
  });
});
