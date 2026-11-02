import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type ObservabilityContext = {
  correlationId?: string;
  operationId?: string;
  operationName?: string;
};

const requestContext = new AsyncLocalStorage<ObservabilityContext>();

export const runWithCorrelationId = <T>(
  correlationId: string,
  callback: () => T,
): T =>
  requestContext.run({ ...requestContext.getStore(), correlationId }, callback);

export const runWithOperation = <T>(
  operationId: string,
  operationName: string,
  callback: () => T,
): T =>
  requestContext.run(
    { ...requestContext.getStore(), operationId, operationName },
    callback,
  );

export const runWithRequestId = <T>(requestId: string, callback: () => T): T =>
  requestContext.run(
    {
      ...requestContext.getStore(),
      correlationId: requestId,
      operationId: requestId,
      operationName: 'http.request',
    },
    callback,
  );

export const createOperationId = (operationName: string): string =>
  `${operationName}:${randomUUID()}`;

export const getCorrelationId = (): string | undefined =>
  requestContext.getStore()?.correlationId;

export const getOperationId = (): string | undefined =>
  requestContext.getStore()?.operationId;

export const getOperationName = (): string | undefined =>
  requestContext.getStore()?.operationName;
