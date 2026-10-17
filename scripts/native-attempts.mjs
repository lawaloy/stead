import { runCommand } from './process-utils.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

// A failed XCTest request can leave Maestro's JVM alive after its main thread
// throws. Bound the owned process so cleanup and evidence collection can finish.
export const runMaestroCommand = async (
  command,
  args,
  options,
  {
    execute = runCommand,
    timeoutMs = Number(TOOLCHAIN.MAESTRO_FLOW_TIMEOUT_MS),
  } = {},
) => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Maestro process timeout must be a positive integer.');
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  timer.unref();
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal;
  try {
    return await execute(command, args, { ...options, signal });
  } catch (error) {
    if (deadline.signal.aborted && !options.signal?.aborted)
      throw new Error(
        `Maestro exceeded its ${timeoutMs} ms process deadline. The attempt failed; inspect its driver logs.`,
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const repeatJourneys = async (count, operation, signal) => {
  const attempts = [];
  for (let index = 0; index < count; index += 1) {
    if (signal?.aborted) break;
    try {
      attempts.push({
        attempt: index + 1,
        status: 'passed',
        ...(await operation(index + 1)),
      });
    } catch (error) {
      attempts.push({
        attempt: index + 1,
        status: 'failed',
        error: error.message,
      });
    }
  }
  return attempts;
};
