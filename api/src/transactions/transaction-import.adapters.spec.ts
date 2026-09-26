import { BadRequestException } from '@nestjs/common';
import {
  toCanonicalImportCsv,
  transactionImportAdapters,
} from './transaction-import.adapters';
import { parseTransactionImport } from './transaction-import.parser';

describe('transaction import adapters', () => {
  it('prefers the Stead canonical layout when amount and type columns are present', () => {
    const csv = [
      'date,description,amount,type,debit,credit',
      '2026-09-01,Salary,5000,credit,,',
    ].join('\n');

    expect(
      transactionImportAdapters.find((adapter) =>
        adapter.matches([
          'date',
          'description',
          'amount',
          'type',
          'debit',
          'credit',
        ]),
      )?.id,
    ).toBe('stead-canonical');

    const [row] = parseTransactionImport(csv);
    expect(row).toMatchObject({
      direction: 'in',
      amountKobo: 500_000,
      note: 'Salary',
      error: null,
    });
  });

  it('maps provisional debit/credit exports into the canonical parser', () => {
    const csv = [
      'Transaction Date,Narration,Debit,Credit',
      '01/09/2026,Salary,,"NGN 250,000.00"',
      '02/09/2026,Groceries,12500.50,',
    ].join('\n');

    const canonical = toCanonicalImportCsv(csv);
    expect(canonical.split('\n')[0]).toBe('date,description,amount,type');

    const rows = parseTransactionImport(csv);
    expect(rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        occurredAt: '2026-09-01T12:00:00.000Z',
        direction: 'in',
        amountKobo: 25_000_000,
        note: 'Salary',
        error: null,
      }),
      expect.objectContaining({
        rowNumber: 3,
        occurredAt: '2026-09-02T12:00:00.000Z',
        direction: 'out',
        amountKobo: 1_250_050,
        note: 'Groceries',
        error: null,
      }),
    ]);
  });

  it('keeps fingerprints stable for provisional exports across repeat parses', () => {
    const csv = [
      'date,narration,debit,credit',
      '2026-09-01,Transfer,,5000',
      '2026-09-01,Transfer,,5000',
    ].join('\n');
    const first = parseTransactionImport(csv);
    const second = parseTransactionImport(csv);

    expect(first[0].fingerprint).not.toBe(first[1].fingerprint);
    expect(first.map((row) => row.fingerprint)).toEqual(
      second.map((row) => row.fingerprint),
    );
  });

  it('rejects unknown layouts with the canonical column requirement', () => {
    expect(() => toCanonicalImportCsv('foo,bar\n1,2')).toThrow(
      BadRequestException,
    );
    expect(() => toCanonicalImportCsv('foo,bar\n1,2')).toThrow(
      /CSV must include these columns: date, description, amount, type/,
    );
  });

  it('marks rows with both debit and credit filled as invalid after adaptation', () => {
    const [row] = parseTransactionImport(
      ['date,narration,debit,credit', '2026-09-01,Ambiguous,100,200'].join(
        '\n',
      ),
    );

    expect(row.error).toContain('Amount must be a positive naira value');
    expect(row.error).toContain('Type must be');
  });
});
