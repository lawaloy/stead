import type { Attributes, Meter } from '@opentelemetry/api';
import { ObservabilityMetrics } from './metrics';

describe('ObservabilityMetrics', () => {
  let counters: Map<string, jest.Mock>;
  let histograms: Map<string, jest.Mock>;
  let meter: Meter;

  beforeEach(() => {
    counters = new Map();
    histograms = new Map();
    meter = {
      createCounter: jest.fn((name: string) => {
        const add = jest.fn();
        counters.set(name, add);
        return { add };
      }),
      createHistogram: jest.fn((name: string) => {
        const record = jest.fn();
        histograms.set(name, record);
        return { record };
      }),
    } as unknown as Meter;
  });

  it('records counts and second-based durations with bounded attributes', () => {
    const metrics = new ObservabilityMetrics(meter);

    metrics.recordHttpRequest({
      method: 'GET',
      route: '/goals/:id',
      statusCode: 503,
      durationMs: 1_250,
    });
    metrics.recordNotificationJob({
      type: 'risk.alert',
      provider: 'termii',
      outcome: 'retry',
      durationMs: 250,
    });

    const httpAttributes: Attributes = {
      'http.request.method': 'GET',
      'http.route': '/goals/:id',
      'http.response.status_code': 503,
      'stead.outcome': 'error',
    };
    expect(
      counters.get('stead.http.server.request.count'),
    ).toHaveBeenCalledWith(1, httpAttributes);
    expect(
      histograms.get('stead.http.server.request.duration'),
    ).toHaveBeenCalledWith(1.25, httpAttributes);
    expect(counters.get('stead.notification.job.count')).toHaveBeenCalledWith(
      1,
      {
        'notification.type': 'risk.alert',
        'sms.provider': 'termii',
        'stead.outcome': 'retry',
      },
    );
  });

  it('treats client and auth HTTP failures as successful request outcomes', () => {
    const metrics = new ObservabilityMetrics(meter);

    metrics.recordHttpRequest({
      method: 'POST',
      route: '/auth/verify-otp',
      statusCode: 401,
      durationMs: 40,
    });
    metrics.recordHttpRequest({
      method: 'POST',
      route: '/auth/request-otp',
      statusCode: 429,
      durationMs: 12,
    });

    expect(
      counters.get('stead.http.server.request.count'),
    ).toHaveBeenCalledWith(1, {
      'http.request.method': 'POST',
      'http.route': '/auth/verify-otp',
      'http.response.status_code': 401,
      'stead.outcome': 'success',
    });
    expect(
      counters.get('stead.http.server.request.count'),
    ).toHaveBeenCalledWith(1, {
      'http.request.method': 'POST',
      'http.route': '/auth/request-otp',
      'http.response.status_code': 429,
      'stead.outcome': 'success',
    });
  });

  it('never records negative or non-finite durations', () => {
    const metrics = new ObservabilityMetrics(meter);

    metrics.recordNotificationPoll({ outcome: 'empty', durationMs: -10 });
    metrics.recordSchedulerRun({ outcome: 'error', durationMs: Infinity });

    expect(
      histograms.get('stead.notification.poll.duration'),
    ).toHaveBeenCalledWith(0, { 'stead.outcome': 'empty' });
    expect(
      histograms.get('stead.alert.scheduler.run.duration'),
    ).toHaveBeenCalledWith(0, { 'stead.outcome': 'error' });
  });
});
