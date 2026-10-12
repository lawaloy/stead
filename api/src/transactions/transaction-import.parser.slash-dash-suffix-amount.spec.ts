import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport slash-dash suffix amounts', () => {
  it.each(['2500/-', '2500.50/-', '1,250/-'] as const)(
    'rejects %s instead of stripping a trailing /- and importing the number',
    (amount) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,Transfer,"${amount}",income`,
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
