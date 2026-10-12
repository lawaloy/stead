import { weeklySchedule } from './alert-rules';

describe('weeklySchedule America/Los_Angeles spring-forward', () => {
  it('stays not-due at 1:59 local before the skipped 2am hour', () => {
    expect(
      weeklySchedule(
        new Date('2026-03-08T09:59:00.000Z'),
        'America/Los_Angeles',
        0,
        2,
      ),
    ).toEqual({ due: false, key: '2026-03-08' });
  });

  it('becomes due at 3:00 local, the first existing hour after the skipped 2am', () => {
    expect(
      weeklySchedule(
        new Date('2026-03-08T10:00:00.000Z'),
        'America/Los_Angeles',
        0,
        2,
      ),
    ).toEqual({ due: true, key: '2026-03-08' });
  });
});
