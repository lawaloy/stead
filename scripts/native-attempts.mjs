import { runCommand } from './process-utils.mjs';
import { TOOLCHAIN } from './toolchain.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const TRANSIENT_ANDROID_MAESTRO_BOOTSTRAP =
  /DeviceServerDiedException: Device server died during 'deviceInfo'[\s\S]*StatusRuntimeException: UNAVAILABLE/;

const maestroLogPaths = (directory) => {
  if (!existsSync(directory)) return [];
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...maestroLogPaths(path));
    else if (entry.name === 'maestro.log') paths.push(path);
  }
  return paths;
};

export const runMaestroWithBootstrapRecovery = async (
  operation,
  {
    platform,
    debugOutput,
    recover,
    signal,
    maxAttempts = 3,
    sleep = (milliseconds, waitSignal) =>
      delay(milliseconds, undefined, { signal: waitSignal }),
  },
) => {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
    throw new Error('Maestro bootstrap attempts must be a positive integer.');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    signal?.throwIfAborted();
    const previousLogs = new Set(maestroLogPaths(debugOutput));
    try {
      return { result: await operation(attempt), recoveries: attempt - 1 };
    } catch (error) {
      signal?.throwIfAborted();
      const newLogs = maestroLogPaths(debugOutput).filter(
        (path) => !previousLogs.has(path),
      );
      const transientBootstrapFailure =
        platform === 'android' &&
        newLogs.some((path) =>
          TRANSIENT_ANDROID_MAESTRO_BOOTSTRAP.test(readFileSync(path, 'utf8')),
        );
      if (!transientBootstrapFailure || attempt === maxAttempts) throw error;

      const backoffMs = 2 ** (attempt - 1) * 1_000;
      console.warn(
        `Maestro's Android device server died before the journey began. Retrying bootstrap after ${backoffMs} ms (${attempt}/${maxAttempts}).`,
      );
      await sleep(backoffMs, signal);
      await recover({ attempt, error });
    }
  }
};

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
