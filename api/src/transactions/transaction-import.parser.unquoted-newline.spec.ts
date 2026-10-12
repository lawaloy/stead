import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport unquoted physical newlines', () => {
  it('splits an unquoted narration newline into broken rows instead of importing one transaction', () => {
    const rows = parseTransactionImport(
      [
        'date,description,amount,type',
        '2026-09-01,Line one',
        'line two,100,income',
        '2026-09-02,Valid,50,expense',
      ].join('\n'),
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      occurredAt: '2026-09-01T12:00:00.000Z',
      note: 'Line one',
      amountKobo: null,
      direction: null,
      fingerprint: null,
    });
    expect(rows[0].error).toContain('Amount must be a positive naira value');
    expect(rows[0].error).toContain(
      'Type must be income, expense, credit, or debit',
    );

    expect(rows[1]).toMatchObject({
      rowNumber: 3,
      occurredAt: null,
      note: '100',
      amountKobo: null,
      direction: null,
      fingerprint: null,
    });
    expect(rows[1].error).toContain('Date must use YYYY-MM-DD');
    expect(rows[1].error).toContain('Amount must be a positive naira value');
    expect(rows[1].error).toContain(
      'Type must be income, expense, credit, or debit',
    );

    expect(rows[2]).toMatchObject({
      rowNumber: 4,
      occurredAt: '2026-09-02T12:00:00.000Z',
      direction: 'out',
      amountKobo: 5_000,
      note: 'Valid',
      error: null,
    });
    expect(rows[2].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
