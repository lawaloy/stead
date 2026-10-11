import {
  toCanonicalImportCsv,
  transactionImportAdapters,
} from './transaction-import.adapters';
import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import adapter aliases', () => {
  it.each([
    {
      headers: 'Value Date,Particulars,Debit,Credit',
      date: '01-09-2026',
      description: 'Salary',
      debit: '',
      credit: '"NGN 250,000.00"',
      expected: {
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'in' as const,
        amountKobo: 25_000_000,
        note: 'Salary',
      },
    },
    {
      headers: 'Posting Date,Details,Debit,Credit',
      date: '02-09-2026',
      description: 'Groceries',
      debit: '12500.50',
      credit: '',
      expected: {
        occurredAt: '2026-09-02T12:00:00.000Z',
        direction: 'out' as const,
        amountKobo: 1_250_050,
        note: 'Groceries',
      },
    },
  ])(
    'maps documented $headers aliases and DD-MM-YYYY into canonical rows',
    ({ headers, date, description, debit, credit, expected }) => {
      const csv = [headers, [date, description, debit, credit].join(',')].join(
        '\n',
      );

      expect(
        transactionImportAdapters.find((adapter) =>
          adapter.matches(
            headers.split(',').map((header) => header.trim().toLowerCase()),
          ),
        )?.id,
      ).toBe('provisional-debit-credit');
      expect(toCanonicalImportCsv(csv).split('\n')[0]).toBe(
        'date,description,amount,type',
      );

      const [row] = parseTransactionImport(csv);
      expect(row).toMatchObject({
        rowNumber: 2,
        error: null,
        ...expected,
      });
    },
  );

  it('marks rows with neither debit nor credit filled as invalid after adaptation', () => {
    const [row] = parseTransactionImport(
      ['value date,particulars,debit,credit', '01-09-2026,Blank,,'].join('\n'),
    );

    expect(row.error).toContain('Amount must be a positive naira value');
    expect(row.error).toContain('Type must be');
  });

  it('treats currency-prefix-only debit or credit cells as empty', () => {
    const [row] = parseTransactionImport(
      ['posting date,details,debit,credit', '01-09-2026,Blank,NGN,₦'].join(
        '\n',
      ),
    );

    expect(row.error).toContain('Amount must be a positive naira value');
    expect(row.error).toContain('Type must be');
  });
});
