import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport vulgar-fraction amounts', () => {
  it.each(['2500½', '1250¼', '1,250¾'] as const)(
    'rejects %s instead of importing the whole digits and dropping the fraction',
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
