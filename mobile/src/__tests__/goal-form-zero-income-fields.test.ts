import { goalToFormFields } from '../lib/goal-form';

describe('goal form zero monthly income fields', () => {
  it('keeps an explicit zero income as 0 instead of collapsing it to a blank field', () => {
    expect(
      goalToFormFields({
        id: 'goal_1',
        userId: 'user_1',
        name: 'Rent',
        amountTotalKobo: 120_000_000,
        dueDate: '2026-12-31T12:00:00.000Z',
        monthlyIncomeKobo: 0,
        isActive: true,
        status: 'active',
        endedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      name: 'Rent',
      amountNaira: '1200000',
      dueOn: '2026-12-31',
      monthlyIncomeNaira: '0',
    });
  });
});
