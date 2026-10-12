import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport whitespace-only description', () => {
  it.each(['   ', '\t', ' \n '])(
    'rejects a whitespace-only description %j on an otherwise valid row',
    (description) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,"${description}",100,expense`,
        ].join('\n'),
      );

      expect(row).toMatchObject({
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'out',
        amountKobo: 10_000,
        note: null,
        fingerprint: null,
      });
      expect(row.error).toBe('Description is required');
    },
  );
});
