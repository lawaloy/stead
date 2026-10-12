import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport accounting-style signed amounts', () => {
  it.each(['(1250.00)', '(1,250.00)', '(NGN 1250)', '1250.00-'] as const)(
    'rejects %s instead of importing an absolute naira value',
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
