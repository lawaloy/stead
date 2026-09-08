import { riskDecision, weeklySchedule } from './alert-rules';

describe('readiness alert rules', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');

  it('alerts on the first non-stable observation', () => {
    expect(riskDecision({ status: 'warning', score: 55 }, null, now)).toBe(
      'risk',
    );
  });

  it('alerts on status worsening or a 15-point score drop', () => {
    const baseline = {
      lastNotifiedStatus: 'warning',
      lastNotifiedScore: 60,
      lastRiskAlertAt: new Date('2026-09-05T10:00:00.000Z'),
    };
    expect(riskDecision({ status: 'critical', score: 50 }, baseline, now)).toBe(
      'risk',
    );
    expect(riskDecision({ status: 'warning', score: 45 }, baseline, now)).toBe(
      'risk',
    );
    expect(
      riskDecision({ status: 'warning', score: 46 }, baseline, now),
    ).toBeNull();
  });

  it('suppresses deterioration during the 24-hour cooldown', () => {
    expect(
      riskDecision(
        { status: 'critical', score: 20 },
        {
          lastNotifiedStatus: 'warning',
          lastNotifiedScore: 60,
          lastRiskAlertAt: new Date('2026-09-06T10:01:00.000Z'),
        },
        now,
      ),
    ).toBeNull();
  });

  it('sends a recovery only after a notified warning or critical state', () => {
    expect(
      riskDecision(
        { status: 'stable', score: 72 },
        {
          lastNotifiedStatus: 'critical',
          lastNotifiedScore: 30,
          lastRiskAlertAt: now,
        },
        now,
      ),
    ).toBe('recovery');
    expect(riskDecision({ status: 'stable', score: 90 }, null, now)).toBeNull();
  });

  it('computes a timezone-aware weekly bucket and due state', () => {
    expect(weeklySchedule(now, 'Africa/Lagos', 1, 9)).toEqual({
      due: true,
      key: '2026-09-06',
    });
    expect(weeklySchedule(now, 'America/Los_Angeles', 1, 9)).toEqual({
      due: false,
      key: '2026-09-06',
    });
  });
});
