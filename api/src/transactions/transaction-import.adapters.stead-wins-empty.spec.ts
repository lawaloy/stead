import { parseTransactionImport } from './transaction-import.parser';
import { transactionImportAdapters } from './transaction-import.adapters';

const hybridHeaders = [
  'date',
  'description',
  'amount',
  'type',
  'debit',
  'credit',
];

describe('transaction import Stead-wins empty canonical cells', () => {
  it('does not fall back to debit or credit when Stead amount and type are blank', () => {
    expect(
      transactionImportAdapters.find((adapter) =>
        adapter.matches(hybridHeaders),
      )?.id,
    ).toBe('stead-canonical');

    const [row] = parseTransactionImport(
      [
        'date,description,amount,type,debit,credit',
        '2026-09-01,Salary,,,5000,',
      ].join('\n'),
    );

    expect(row.error).toContain('Amount must be a positive naira value');
    expect(row.error).toContain('Type must be');
    expect(row.fingerprint).toBeNull();
    expect(row.direction).toBeNull();
    expect(row.amountKobo).toBeNull();
  });

  it('uses Stead amount and type when debit and credit also have values', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type,debit,credit',
        '2026-09-01,Salary,2500,credit,5000,',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      direction: 'in',
      amountKobo: 250_000,
      note: 'Salary',
      error: null,
    });
  });
});
