import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = {
  correlationId: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

export const runWithCorrelationId = <T>(
  correlationId: string,
  callback: () => T,
): T => requestContext.run({ correlationId }, callback);

export const getCorrelationId = (): string | undefined =>
  requestContext.getStore()?.correlationId;
