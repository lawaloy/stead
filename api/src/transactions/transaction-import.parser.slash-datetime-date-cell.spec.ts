import { parseTransactionImport } from './transaction-import.parser';

const SLASH_DATETIME_CELLS = [
  '01/09/2026 00:00:00',
  '1/9/2026 00:00:00',
  '01/09/2026 12:00',
  '01-09-2026 10:30:00',
] as const;

describe('parseTransactionImport slash and dash datetime date cells', () => {
  it.each(SLASH_DATETIME_CELLS)(
    'rejects canonical %s instead of slicing a calendar day',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `${dateCell},Salary,2500.50,income`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );

  it.each(SLASH_DATETIME_CELLS)(
    'rejects provisional %s instead of adapting the date before the time',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'Value Date,Particulars,Debit,Credit',
          `${dateCell},Salary,,"2500.50"`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );
});
