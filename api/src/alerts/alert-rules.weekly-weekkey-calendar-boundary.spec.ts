import { weeklySchedule } from './alert-rules';

describe('weeklySchedule week-key calendar boundaries', () => {
  it('keeps the same Sunday-based week key across a local month boundary in Africa/Lagos', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-30T09:00:00.000Z'),
        'Africa/Lagos',
        1,
        9,
      ),
    ).toEqual({ due: true, key: '2026-09-27' });
    expect(
      weeklySchedule(
        new Date('2026-10-01T09:00:00.000Z'),
        'Africa/Lagos',
        1,
        9,
      ),
    ).toEqual({ due: true, key: '2026-09-27' });
  });

  it('rolls the week key into the previous year when local New Year is mid-week', () => {
    expect(
      weeklySchedule(
        new Date('2027-01-01T09:00:00.000Z'),
        'Africa/Lagos',
        1,
        9,
      ),
    ).toEqual({ due: true, key: '2026-12-27' });
  });

  it('stays not-due on the Sunday that opens that year-boundary week', () => {
    expect(
      weeklySchedule(
        new Date('2026-12-27T09:00:00.000Z'),
        'Africa/Lagos',
        1,
        9,
      ),
    ).toEqual({ due: false, key: '2026-12-27' });
  });
});
