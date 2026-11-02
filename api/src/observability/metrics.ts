import type { Attributes, Counter, Histogram, Meter } from '@opentelemetry/api';

export const OBSERVABILITY_METRICS = Symbol('OBSERVABILITY_METRICS');

type DurationMetric = {
  count: Counter;
  duration: Histogram;
};

const seconds = (durationMs: number) =>
  Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1_000 : 0;

export class ObservabilityMetrics {
  private readonly httpRequests: DurationMetric;
  private readonly notificationPolls: DurationMetric;
  private readonly notificationJobs: DurationMetric;
  private readonly schedulerRuns: DurationMetric;
  private readonly providerRequests: DurationMetric;

  constructor(meter: Meter) {
    this.httpRequests = this.createDurationMetric(
      meter,
      'stead.http.server.request',
      'Inbound HTTP requests handled by the API',
    );
    this.notificationPolls = this.createDurationMetric(
      meter,
      'stead.notification.poll',
      'Notification queue poll cycles',
    );
    this.notificationJobs = this.createDurationMetric(
      meter,
      'stead.notification.job',
      'Claimed notification jobs processed by the consumer',
    );
    this.schedulerRuns = this.createDurationMetric(
      meter,
      'stead.alert.scheduler.run',
      'Readiness alert scheduler evaluations',
    );
    this.providerRequests = this.createDurationMetric(
      meter,
      'stead.sms.provider.request',
      'SMS provider delivery attempts',
    );
  }

  recordHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
  }) {
    this.record(this.httpRequests, input.durationMs, {
      'http.request.method': input.method,
      'http.route': input.route,
      'http.response.status_code': input.statusCode,
      'stead.outcome': input.statusCode >= 500 ? 'error' : 'success',
    });
  }

  recordNotificationPoll(input: {
    outcome: 'empty' | 'processed' | 'error' | 'skipped';
    durationMs: number;
  }) {
    this.record(this.notificationPolls, input.durationMs, {
      'stead.outcome': input.outcome,
    });
  }

  recordNotificationJob(input: {
    type: string;
    provider: string;
    outcome: 'sent' | 'cancelled' | 'retry' | 'dead_letter' | 'error';
    durationMs: number;
  }) {
    this.record(this.notificationJobs, input.durationMs, {
      'notification.type': input.type,
      'sms.provider': input.provider,
      'stead.outcome': input.outcome,
    });
  }

  recordSchedulerRun(input: {
    outcome: 'success' | 'error' | 'skipped';
    durationMs: number;
  }) {
    this.record(this.schedulerRuns, input.durationMs, {
      'stead.outcome': input.outcome,
    });
  }

  recordProviderRequest(input: {
    provider: string;
    kind: 'otp' | 'notification';
    outcome: 'success' | 'error';
    durationMs: number;
  }) {
    this.record(this.providerRequests, input.durationMs, {
      'notification.kind': input.kind,
      'sms.provider': input.provider,
      'stead.outcome': input.outcome,
    });
  }

  private createDurationMetric(
    meter: Meter,
    prefix: string,
    description: string,
  ): DurationMetric {
    return {
      count: meter.createCounter(`${prefix}.count`, {
        description,
        unit: '{operation}',
      }),
      duration: meter.createHistogram(`${prefix}.duration`, {
        description: `${description} duration`,
        unit: 's',
      }),
    };
  }

  private record(
    metric: DurationMetric,
    durationMs: number,
    attributes: Attributes,
  ) {
    metric.count.add(1, attributes);
    metric.duration.record(seconds(durationMs), attributes);
  }
}
