import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport CR/DR type abbreviations', () => {
  it.each(['CR', 'DR', 'cr', 'dr', 'Cr', 'Dr'] as const)(
    'rejects type %s instead of treating it as credit or debit',
    (type) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,Transfer,2500.50,${type}`,
        ].join('\n'),
      );

      expect(row).toMatchObject({
        rowNumber: 2,
        occurredAt: '2026-09-01T12:00:00.000Z',
        amountKobo: 250_050,
        note: 'Transfer',
        direction: null,
        fingerprint: null,
      });
      expect(row.error).toContain(
        'Type must be income, expense, credit, or debit',
      );
    },
  );
});
