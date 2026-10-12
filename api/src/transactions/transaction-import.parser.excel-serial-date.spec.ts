import { parseTransactionImport } from './transaction-import.parser';

const EXCEL_SERIAL_DATES = ['45931', '45205.0'] as const;

describe('parseTransactionImport Excel serial date cells', () => {
  it.each(EXCEL_SERIAL_DATES)(
    'rejects canonical %s instead of converting an Excel day count',
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

  it.each(EXCEL_SERIAL_DATES)(
    'rejects provisional %s instead of adapting it as a calendar day',
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
