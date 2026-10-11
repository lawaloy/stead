import {
  toCanonicalImportCsv,
  transactionImportAdapters,
} from './transaction-import.adapters';
import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import adapter BOM headers', () => {
  it('matches a provisional export when the first header carries a UTF-8 BOM', () => {
    const csv = [
      '\uFEFFValue Date,Particulars,Debit,Credit',
      '01-09-2026,Salary,,"2500"',
    ].join('\n');

    expect(toCanonicalImportCsv(csv).split('\n')[0]).toBe(
      'date,description,amount,type',
    );
    expect(
      transactionImportAdapters.find((adapter) =>
        adapter.matches(['value date', 'particulars', 'debit', 'credit']),
      )?.id,
    ).toBe('provisional-debit-credit');

    const [row] = parseTransactionImport(csv);
    expect(row).toMatchObject({
      rowNumber: 2,
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'in',
      amountKobo: 250_000,
      note: 'Salary',
      error: null,
    });
  });
});
