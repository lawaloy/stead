import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport tab-grouped amounts', () => {
  it.each(['1\t250.50', '1\t250', '10\t000.50'] as const)(
    'rejects %s instead of treating a tab as thousands grouping',
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
