import { parseTransactionImport } from './transaction-import.parser';

const COMPACT_DATES = ['20260901', '20260131'] as const;

describe('parseTransactionImport compact YYYYMMDD date cells', () => {
  it.each(COMPACT_DATES)(
    'rejects canonical %s instead of inserting dashes into an 8-digit date',
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

  it.each(COMPACT_DATES)(
    'rejects provisional %s instead of adapting an 8-digit bank date',
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
