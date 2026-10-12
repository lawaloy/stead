import { riskDecision } from './alert-rules';

describe('riskDecision critical-band score drop', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  const baseline = {
    lastNotifiedStatus: 'critical',
    lastNotifiedScore: 40,
    lastRiskAlertAt: new Date('2026-09-05T10:00:00.000Z'),
  };

  it('alerts when a 15-point drop stays inside the critical band', () => {
    expect(riskDecision({ status: 'critical', score: 25 }, baseline, now)).toBe(
      'risk',
    );
  });

  it('stays quiet when a critical-band drop is under 15 points', () => {
    expect(
      riskDecision({ status: 'critical', score: 26 }, baseline, now),
    ).toBeNull();
  });
});
