import { parseTransactionImport } from './transaction-import.parser';

describe('parseTransactionImport NGN prefix without a following space', () => {
  it.each([
    ['NGN250000.50', 25_000_050, 'in'],
    ['ngn1250', 125_000, 'out'],
    ['₦2500.5', 250_050, 'in'],
  ] as const)(
    'imports %s as %s kobo instead of rejecting the currency prefix',
    (amount, amountKobo, type) => {
      const [row] = parseTransactionImport(
        [
          'date,description,amount,type',
          `2026-09-01,Transfer,${amount},${type === 'in' ? 'income' : 'expense'}`,
        ].join('\n'),
      );

      expect(row).toMatchObject({
        amountKobo,
        direction: type,
        error: null,
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
      });
    },
  );
});
