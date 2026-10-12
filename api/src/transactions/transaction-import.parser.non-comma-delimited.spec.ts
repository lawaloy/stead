import { BadRequestException } from '@nestjs/common';
import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport non-comma delimited files', () => {
  it.each([
    [
      'semicolon',
      ['date;description;amount;type', '2026-09-01;Salary;2500.50;income'].join(
        '\n',
      ),
    ],
    [
      'tab',
      [
        'date\tdescription\tamount\ttype',
        '2026-09-01\tSalary\t2500.50\tincome',
      ].join('\n'),
    ],
    [
      'pipe',
      ['date|description|amount|type', '2026-09-01|Salary|2500.50|income'].join(
        '\n',
      ),
    ],
  ] as const)(
    'rejects a %s-delimited canonical CSV instead of splitting on a non-comma separator',
    (_delimiter, csv) => {
      expect(() => parseTransactionImport(csv)).toThrow(BadRequestException);
      expect(() => parseTransactionImport(csv)).toThrow(
        'CSV must include these columns: date, description, amount, type',
      );
    },
  );

  it('rejects a semicolon-delimited provisional debit/credit export instead of adapting it', () => {
    const csv = [
      'Value Date;Particulars;Debit;Credit',
      '2026-09-01;Salary;;2500.50',
    ].join('\n');

    expect(() => parseTransactionImport(csv)).toThrow(BadRequestException);
    expect(() => parseTransactionImport(csv)).toThrow(
      'CSV must include these columns: date, description, amount, type',
    );
  });
});
