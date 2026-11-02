import { Global, Module } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { OBSERVABILITY_METRICS, ObservabilityMetrics } from './metrics';

@Global()
@Module({
  providers: [
    {
      provide: OBSERVABILITY_METRICS,
      useFactory: () =>
        new ObservabilityMetrics(metrics.getMeter('stead-api', '1.0.0')),
    },
  ],
  exports: [OBSERVABILITY_METRICS],
})
export class ObservabilityModule {}
