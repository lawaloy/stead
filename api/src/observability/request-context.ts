import { AsyncLocalStorage } from 'node:async_hooks';

type ObservabilityContext = {
  correlationId?: string;
  operationId?: string;
};

const requestContext = new AsyncLocalStorage<ObservabilityContext>();

export const runWithCorrelationId = <T>(
  correlationId: string,
  callback: () => T,
): T =>
  requestContext.run({ ...requestContext.getStore(), correlationId }, callback);

export const runWithOperationId = <T>(
  operationId: string,
  callback: () => T,
): T =>
  requestContext.run({ ...requestContext.getStore(), operationId }, callback);

export const getCorrelationId = (): string | undefined =>
  requestContext.getStore()?.correlationId;

export const getOperationId = (): string | undefined =>
  requestContext.getStore()?.operationId;
