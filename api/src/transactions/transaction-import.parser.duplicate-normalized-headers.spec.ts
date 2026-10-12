import { BadRequestException } from '@nestjs/common';
import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport case-normalized duplicate headers', () => {
  it.each([
    'Date,date,description,amount,type',
    'date,description,Amount,amount,type',
    ' Date , DATE ,description,amount,type',
  ] as const)(
    'rejects %s instead of binding one of the colliding columns',
    (headers) => {
      expect(() =>
        parseTransactionImport(
          [headers, '2026-09-01,Salary,2500.50,income'].join('\n'),
        ),
      ).toThrow(new BadRequestException('CSV contains duplicate column names'));
    },
  );
});
