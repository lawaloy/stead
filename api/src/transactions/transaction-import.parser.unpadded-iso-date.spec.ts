import { parseTransactionImport } from './transaction-import.parser';

const UNPADDED_ISO_DATES = ['2026-9-1', '2026-09-1', '2026-9-01'] as const;

describe('parseTransactionImport unpadded ISO dates', () => {
  it.each(UNPADDED_ISO_DATES)(
    'rejects canonical %s instead of padding it to a calendar day',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `${dateCell},Salary,2500.50,income`,
        ].join('\n'),
      );

      expect(row).toMatchObject({
        rowNumber: 2,
        occurredAt: null,
        direction: 'in',
        amountKobo: 250_050,
        note: 'Salary',
        fingerprint: null,
      });
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );

  it.each(UNPADDED_ISO_DATES)(
    'rejects provisional %s instead of padding year-first ISO as DD-MM',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'Value Date,Particulars,Debit,Credit',
          `${dateCell},Salary,,"2500.50"`,
        ].join('\n'),
      );

      expect(row).toMatchObject({
        rowNumber: 2,
        occurredAt: null,
        direction: 'in',
        amountKobo: 250_050,
        note: 'Salary',
        fingerprint: null,
      });
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );
});
