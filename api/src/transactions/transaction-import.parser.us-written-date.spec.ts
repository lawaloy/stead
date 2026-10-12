import { parseTransactionImport } from './transaction-import.parser';

const US_WRITTEN_DATES = [
  'Sep 1, 2026',
  'Sep 01, 2026',
  'September 1, 2026',
] as const;

describe('parseTransactionImport US written date cells', () => {
  it.each(US_WRITTEN_DATES)(
    'rejects canonical %s instead of mapping a month-name date onto YYYY-MM-DD',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `"${dateCell}",Salary,2500.50,income`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );

  it.each(US_WRITTEN_DATES)(
    'rejects provisional %s instead of adapting a US written month-name date',
    (dateCell) => {
      const [row] = parseTransactionImport(
        [
          'Value Date,Particulars,Debit,Credit',
          `"${dateCell}",Salary,,"2500.50"`,
        ].join('\n'),
      );

      expect(row.occurredAt).toBeNull();
      expect(row.fingerprint).toBeNull();
      expect(row.error).toContain('Date must use YYYY-MM-DD');
    },
  );
});
