import { weeklySchedule } from './alert-rules';

describe('weeklySchedule midnight hour (weeklyHourLocal 0)', () => {
  it('stays not-due at 23:59 the day before the scheduled weekday in Africa/Lagos', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-06T22:59:00.000Z'),
        'Africa/Lagos',
        1,
        0,
      ),
    ).toEqual({ due: false, key: '2026-09-06' });
  });

  it('becomes due at local midnight on the scheduled weekday in Africa/Lagos', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-06T23:00:00.000Z'),
        'Africa/Lagos',
        1,
        0,
      ),
    ).toEqual({ due: true, key: '2026-09-06' });
  });

  it('stays due later the same weekday after midnight', () => {
    expect(
      weeklySchedule(
        new Date('2026-09-07T08:00:00.000Z'),
        'Africa/Lagos',
        1,
        0,
      ),
    ).toEqual({ due: true, key: '2026-09-06' });
  });
});
