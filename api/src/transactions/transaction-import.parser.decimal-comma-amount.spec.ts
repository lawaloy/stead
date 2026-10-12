import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport European decimal-comma amounts', () => {
  it.each(['1.250,50', '1250,50', '1.250,5'] as const)(
    'rejects %s instead of treating comma as the naira decimal',
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
