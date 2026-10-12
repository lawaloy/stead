import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport nbsp-grouped amounts', () => {
  it.each(['1\u00a0250.50', '1\u202f250.50', '10\u00a0000.50'] as const)(
    'rejects %s instead of treating a Unicode space as thousands grouping',
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
