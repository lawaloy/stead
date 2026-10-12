import { weeklySchedule } from './alert-rules';

describe('weeklySchedule last hour (weeklyHourLocal 23)', () => {
  it('stays not-due at 22:59 local on the scheduled weekday in Africa/Lagos', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-07T21:59:00.000Z'),
        'Africa/Lagos',
        1,
        23,
      ),
    ).toEqual({ due: false, key: '2026-09-06' });
  });

  it('becomes due at 23:00 local on the scheduled weekday in Africa/Lagos', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-07T22:00:00.000Z'),
        'Africa/Lagos',
        1,
        23,
      ),
    ).toEqual({ due: true, key: '2026-09-06' });
  });

  it('stays due after midnight into the next local weekday in the same week bucket', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-07T23:00:00.000Z'),
        'Africa/Lagos',
        1,
        23,
      ),
    ).toEqual({ due: true, key: '2026-09-06' });
  });
});
