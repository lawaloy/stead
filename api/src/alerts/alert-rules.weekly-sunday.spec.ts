import { weeklySchedule } from './alert-rules';

describe('weeklySchedule Sunday (weeklyDay 0)', () => {
  it('stays not-due before the scheduled Sunday hour in Africa/Lagos', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-06T07:59:00.000Z'),
        'Africa/Lagos',
        0,
        9,
      ),
    ).toEqual({ due: false, key: '2026-09-06' });
  });

  it('becomes due at the scheduled Sunday hour in Africa/Lagos', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-06T08:00:00.000Z'),
        'Africa/Lagos',
        0,
        9,
      ),
    ).toEqual({ due: true, key: '2026-09-06' });
  });

  it('stays due later in the same week bucket after Sunday', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-07T08:00:00.000Z'),
        'Africa/Lagos',
        0,
        9,
      ),
    ).toEqual({ due: true, key: '2026-09-06' });
  });
});
