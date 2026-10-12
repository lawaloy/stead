import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport Indian lakh-grouped amounts', () => {
  it.each(['12,50,000', '1,25,000.50', '12,34,567'] as const)(
    'rejects %s instead of treating 2-digit lakh groups as thousands',
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
