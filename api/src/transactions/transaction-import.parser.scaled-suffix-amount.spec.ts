import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport scaled k/m/bn amount suffixes', () => {
  it.each(['1.25k', '2.5m', '1.25bn'] as const)(
    'rejects %s instead of scaling a compact naira suffix',
    (amount) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,Transfer,${amount},income`,
        ].join('\n'),
      );

      expect(row).toMatchObject({
        rowNumber: 2,
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'in',
        amountKobo: null,
        note: 'Transfer',
        fingerprint: null,
      });
      expect(row.error).toContain('Amount must be a positive naira value');
    },
  );
});
