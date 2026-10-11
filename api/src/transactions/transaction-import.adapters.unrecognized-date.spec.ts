import { BadRequestException } from '@nestjs/common';
import {
  toCanonicalImportCsv,
  transactionImportAdapters,
} from './transaction-import.adapters';
import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import adapter layout and date fallback', () => {
  it('does not match a debit-only export that is missing the credit column', () => {
    const headers = ['date', 'narration', 'debit'];

    expect(
      transactionImportAdapters.find((adapter) => adapter.matches(headers))?.id,
    ).toBeUndefined();
    expect(() =>
      toCanonicalImportCsv(
        ['date,narration,debit', '01-09-2026,Salary,100'].join('\n'),
      ),
    ).toThrow(BadRequestException);
  });

  it('forwards unrecognized statement dates so the canonical parser rejects the row', () => {
    const [row] = parseTransactionImport(
      [
        'Value Date,Particulars,Debit,Credit',
        '01 Sep 2026,Salary,,"2500.50"',
      ].join('\n'),
    );

    expect(row.error).toContain('Date must use YYYY-MM-DD');
    expect(row.fingerprint).toBeNull();
  });
});
