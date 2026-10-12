import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport Excel formula amounts', () => {
  it.each(['=2500.50', '=1250', '=1,250.50'] as const)(
    'rejects %s instead of evaluating a leading Excel formula',
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
