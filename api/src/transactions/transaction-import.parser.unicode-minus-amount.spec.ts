import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport unicode minus amounts', () => {
  it.each(['\u22122500.50', '\u22121250', '\u22121,250.50'] as const)(
    'rejects %s instead of stripping a unicode minus and importing the number',
    (amount) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,Transfer,"${amount}",expense`,
        ].join('\n'),
      );

      expect(row).toMatchObject({
        rowNumber: 2,
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'out',
        amountKobo: null,
        note: 'Transfer',
        fingerprint: null,
      });
      expect(row.error).toContain('Amount must be a positive naira value');
    },
  );
});
