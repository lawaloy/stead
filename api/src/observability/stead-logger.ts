import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { getCorrelationId } from './request-context';

const REDACTED_LOG_PATHS = [
  'authorization',
  'cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'otp',
  'codeHash',
  'payloadJson',
  'phone',
  'body',
];

const levelsByMinimum: Record<string, LogLevel[]> = {
  debug: ['debug', 'log', 'warn', 'error', 'fatal'],
  info: ['log', 'warn', 'error', 'fatal'],
  warn: ['warn', 'error', 'fatal'],
  error: ['error', 'fatal'],
};

export class SteadLogger extends ConsoleLogger {
  constructor(environment: NodeJS.ProcessEnv = process.env) {
    super('Stead', {
      json: (environment.LOG_FORMAT ?? 'json') === 'json',
      logLevels: levelsByMinimum[environment.LOG_LEVEL ?? 'info'],
      structuredParams: true,
      flattenParams: true,
      redact: REDACTED_LOG_PATHS,
    });
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(message, ...this.withCorrelation(optionalParams));
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...this.withCorrelation(optionalParams));
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(message, ...this.withCorrelation(optionalParams));
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(message, ...this.withCorrelation(optionalParams));
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(message, ...this.withCorrelation(optionalParams));
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(message, ...this.withCorrelation(optionalParams));
  }

  private withCorrelation(optionalParams: unknown[]): unknown[] {
    const correlationId = getCorrelationId();
    if (!correlationId) return optionalParams;

    const last = optionalParams.at(-1);
    if (typeof last === 'string') {
      return [...optionalParams.slice(0, -1), { correlationId }, last];
    }
    return [...optionalParams, { correlationId }];
  }
}

export const createSteadLogger = (
  environment: NodeJS.ProcessEnv = process.env,
) => new SteadLogger(environment);
