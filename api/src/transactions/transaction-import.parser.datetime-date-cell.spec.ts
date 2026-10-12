import { parseTransactionImport } from './transaction-import.parser';

const DATETIME_CELLS = [
  '2026-09-01 00:00:00',
  '2026-09-01T00:00:00',
  '2026-09-01T00:00:00.000Z',
] as const;

describe('parseTransactionImport datetime date cells', () => {
  it.each(DATETIME_CELLS)(
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

  it.each(DATETIME_CELLS)(
    'rejects provisional %s instead of slicing a calendar day',
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
