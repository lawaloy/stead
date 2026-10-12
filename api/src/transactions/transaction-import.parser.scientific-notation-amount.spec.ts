import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport scientific-notation amounts', () => {
  it.each(['2.50E+03', '1.25E+06', '2.5e3'] as const)(
    'rejects %s instead of expanding Excel scientific notation',
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
