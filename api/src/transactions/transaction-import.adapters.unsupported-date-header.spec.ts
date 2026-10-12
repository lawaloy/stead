import { BadRequestException } from '@nestjs/common';
import {
  toCanonicalImportCsv,
  transactionImportAdapters,
} from './transaction-import.adapters';

describe('transaction import adapter unsupported date headers', () => {
  it('does not treat Book Date as a provisional date alias', () => {
    const headers = ['book date', 'particulars', 'debit', 'credit'];

    expect(
      transactionImportAdapters.find((adapter) => adapter.matches(headers))?.id,
    ).toBeUndefined();
    expect(() =>
      toCanonicalImportCsv(
        [
          'Book Date,Particulars,Debit,Credit',
          '01-09-2026,Salary,,2500.50',
        ].join('\n'),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      toCanonicalImportCsv(
        [
          'Book Date,Particulars,Debit,Credit',
          '01-09-2026,Salary,,2500.50',
        ].join('\n'),
      ),
    ).toThrow(
      /CSV must include these columns: date, description, amount, type/,
    );
  });
});
