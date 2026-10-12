import { parseTransactionImport } from './transaction-import.parser';

const ORDINAL_WRITTEN_DATES = [
  '1st Sep 2026',
  '2nd September 2026',
  '21st Sep 2026',
] as const;

describe('parseTransactionImport ordinal written date cells', () => {
  it.each(ORDINAL_WRITTEN_DATES)(
    'rejects canonical %s instead of stripping an ordinal suffix onto YYYY-MM-DD',
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

  it.each(ORDINAL_WRITTEN_DATES)(
    'rejects provisional %s instead of adapting an ordinal written date',
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
