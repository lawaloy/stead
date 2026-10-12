import { parseTransactionImport } from './transaction-import.parser';

const ISO_OFFSET_DATETIMES = [
  '2026-09-01T00:00:00+01:00',
  '2026-09-01T23:00:00-05:00',
  '2026-09-01T00:00:00.000+01:00',
] as const;

describe('parseTransactionImport ISO offset datetime date cells', () => {
  it.each(ISO_OFFSET_DATETIMES)(
    'rejects canonical %s instead of slicing or converting a timezone offset',
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

  it.each(ISO_OFFSET_DATETIMES)(
    'rejects provisional %s instead of adapting an offset datetime to a calendar day',
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
