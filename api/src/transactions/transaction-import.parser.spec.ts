import { BadRequestException } from '@nestjs/common';
import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport', () => {
  it('parses reordered headers, quoted naira amounts, and bank direction aliases', () => {
    const rows = parseTransactionImport(
      [
        '\uFEFFdescription,type,amount,date,ignored',
        '"Salary, August",credit,"NGN 250,000.50",2026-08-31,x',
        'Groceries,debit,1250,2026-09-01,y',
      ].join('\r\n'),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        occurredAt: '2026-08-31T12:00:00.000Z',
        direction: 'in',
        amountKobo: 25_000_050,
        note: 'Salary, August',
        error: null,
      }),
      expect.objectContaining({
        rowNumber: 3,
        direction: 'out',
        amountKobo: 125_000,
        note: 'Groceries',
        error: null,
      }),
    ]);
    expect(rows[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps identical legitimate rows distinct but stable across repeat previews', () => {
    const csv = [
      'date,description,amount,type',
      '2026-09-01,Transfer,5000,income',
      '2026-09-01,Transfer,5000,income',
    ].join('\n');
    const first = parseTransactionImport(csv);
    const second = parseTransactionImport(csv);

    expect(first[0].fingerprint).not.toBe(first[1].fingerprint);
    expect(first.map((row) => row.fingerprint)).toEqual(
      second.map((row) => row.fingerprint),
    );
  });

  it('returns row-level errors without discarding the rest of the statement', () => {
    const rows = parseTransactionImport(
      [
        'date,description,amount,type',
        '09/01/2026,,zero,transfer',
        '2026-09-02,Valid,100.25,expense',
      ].join('\n'),
    );

    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      fingerprint: null,
    });
    expect(rows[0].error).toContain('Date must use YYYY-MM-DD');
    expect(rows[0].error).toContain('Description is required');
    expect(rows[0].error).toContain('Amount must be a positive naira value');
    expect(rows[0].error).toContain('Type must be');
    expect(rows[1]).toMatchObject({ error: null, amountKobo: 10_025 });
  });

  it.each(['1,2', '12,34', '1,00,000', '1234,567'])(
    'rejects malformed comma grouping in an amount: %s',
    (amount) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,Malformed,"${amount}",expense`,
        ].join('\n'),
      );

      expect(row.amountKobo).toBeNull();
      expect(row.error).toContain('Amount must be a positive naira value');
    },
  );

  it.each([
    ['missing headers', 'date,amount\n2026-09-01,100'],
    ['duplicate headers', 'date,date,description,amount,type'],
    [
      'unclosed quote',
      'date,description,amount,type\n2026-09-01,"oops,10,income',
    ],
    [
      'characters after a quote',
      'date,description,amount,type\n2026-09-01,"oops"extra,10,income',
    ],
    ['no rows', 'date,description,amount,type'],
  ])('rejects structurally invalid CSV: %s', (_case, csv) => {
    expect(() => parseTransactionImport(csv)).toThrow(BadRequestException);
  });

  it('rejects a quote appearing inside an unquoted field', () => {
    expect(() =>
      parseTransactionImport(
        ['date,description,amount,type', '2026-09-01,foo"bar,100,expense'].join(
          '\n',
        ),
      ),
    ).toThrow('Malformed CSV quoting');
  });

  it('rejects more than 500 data rows', () => {
    const csv = [
      'date,description,amount,type',
      ...Array.from(
        { length: 501 },
        (_, index) => `2026-09-01,Row ${index},1,income`,
      ),
    ].join('\n');

    expect(() => parseTransactionImport(csv)).toThrow(
      'CSV cannot contain more than 500 rows',
    );
  });

  it.each(['', '\n\n  \n'])(
    'rejects an empty or whitespace-only CSV',
    (csv) => {
      expect(() => parseTransactionImport(csv)).toThrow('CSV is empty');
    },
  );

  it('accepts naira symbols, in/out aliases, and quoted multiline notes', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,"Rent\n  buffer","₦ 1,250.00",out',
      ].join('\n'),
    );

    expect(row).toMatchObject({
      occurredAt: '2026-09-01T12:00:00.000Z',
      direction: 'out',
      amountKobo: 125_000,
      note: 'Rent buffer',
      error: null,
    });
  });

  it('treats description case as the same fingerprint occurrence sequence', () => {
    const mixed = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Salary,100,income',
        '2026-09-01,salary,100,IN',
      ].join('\n'),
    );
    const [single] = parseTransactionImport(
      ['date,description,amount,type', '2026-09-01,SALARY,100,in'].join('\n'),
    );

    expect(mixed[0].fingerprint).toBe(single.fingerprint);
    expect(mixed[1].fingerprint).not.toBe(mixed[0].fingerprint);
    expect(mixed.every((row) => row.error === null)).toBe(true);
  });

  it.each([
    ['2026-02-30', 'Date must use YYYY-MM-DD'],
    ['2025-02-29', 'Date must use YYYY-MM-DD'],
    ['2026-04-31', 'Date must use YYYY-MM-DD'],
  ])('rejects impossible calendar date %s', (date, message) => {
    const [row] = parseTransactionImport(
      ['date,description,amount,type', `${date},Rent,100,expense`].join('\n'),
    );

    expect(row.occurredAt).toBeNull();
    expect(row.fingerprint).toBeNull();
    expect(row.error).toContain(message);
  });

  it.each([
    ['0', 'Amount must be a positive naira value'],
    ['0.00', 'Amount must be a positive naira value'],
    ['-10', 'Amount must be a positive naira value'],
    ['90071992547410', 'Amount must be a positive naira value'],
    ['1.234', 'Amount must be a positive naira value'],
  ])('rejects unsafe amount %s', (amount, message) => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        `2026-09-01,Overflow,${amount},expense`,
      ].join('\n'),
    );

    expect(row.amountKobo).toBeNull();
    expect(row.fingerprint).toBeNull();
    expect(row.error).toContain(message);
  });

  it('rejects descriptions longer than 280 characters', () => {
    const [row] = parseTransactionImport(
      [
        'date,description,amount,type',
        `2026-09-01,"${'x'.repeat(281)}",100,expense`,
      ].join('\n'),
    );

    expect(row.error).toContain('Description cannot exceed 280 characters');
    expect(row.fingerprint).toBeNull();
  });
});
