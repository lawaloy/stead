import spawn from 'cross-spawn';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { delimiter, dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

export const resolveCommand = (
  command,
  args,
  env = process.env,
  platform = process.platform,
) => {
  if (command === 'npm' && (env.STEAD_NPM_CLI || env.npm_execpath)) {
    return {
      command: process.execPath,
      args: [env.STEAD_NPM_CLI || env.npm_execpath, ...args],
    };
  }
  if (platform === 'win32' && command === 'npm') command = 'npm.cmd';
  if (platform === 'win32' && /\.(bat|cmd)$/i.test(command)) {
    for (const value of [command, ...args]) {
      if (/[\r\n"%!^]/.test(String(value)))
        throw new Error(
          'Unsafe Windows batch argument. Use paths without quotes, percent signs, exclamation marks, or carets.',
        );
    }
  }
  return { command, args };
};

export const spawnOwned = (
  command,
  args,
  { env = process.env, signal, ...options } = {},
) => {
  signal?.throwIfAborted();
  const npmCli = env.STEAD_NPM_CLI || env.npm_execpath;
  const npmModules = npmCli && resolve(dirname(npmCli), '..', '..');
  const npmBin =
    npmModules &&
    [join(npmModules, '.bin'), dirname(npmModules)].find((directory) =>
      existsSync(
        join(directory, process.platform === 'win32' ? 'npm.cmd' : 'npm'),
      ),
    );
  if (npmBin)
    env = {
      ...env,
      PATH: `${npmBin}${delimiter}${env.PATH || env.Path || ''}`,
    };
  const resolved = resolveCommand(command, args, env);
  const child = spawn(resolved.command, resolved.args, {
    ...options,
    env,
    shell: false,
    detached: process.platform !== 'win32',
  });
  // Consumers can await this promise after registering stream handlers.
  child.closed = false;
  child.once('close', () => {
    child.closed = true;
  });
  child.completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    // Inherited pipes can outlive the parent. Wait for descendants' output
    // handles to close too, and for all command output to be collected.
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${command} failed (${signal ?? `exit ${code}`}).`));
    });
  });
  // Background service failures are inspected by readiness checks and cleanup.
  child.completion.catch(() => {});
  if (signal) {
    const abort = () => {
      child.stopping = stopOwned(child);
      child.stopping.catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    child.completion
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(() => {});
  }
  return child;
};

export const runCommand = async (
  command,
  args,
  { quiet = false, stdoutOnly = false, input, ...options } = {},
) => {
  const child = spawnOwned(command, args, {
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    ...options,
  });
  if (input !== undefined) child.stdin.end(input);
  let output = '';
  let stdout = '';
  const collect = (chunk, stream) => {
    output = `${output}${chunk}`.slice(-200_000);
    if (!quiet) stream.write(chunk);
  };
  child.stdout.on('data', (chunk) => {
    stdout = stdoutOnly
      ? `${stdout}${chunk}`
      : `${stdout}${chunk}`.slice(-200_000);
    collect(chunk, process.stdout);
  });
  child.stderr.on('data', (chunk) => collect(chunk, process.stderr));
  try {
    await child.completion;
    options.signal?.throwIfAborted();
  } catch (error) {
    throw new Error(`${error.message}\n${output}`);
  }
  return stdoutOnly ? stdout : output;
};

export const stopOwned = async (child) => {
  if (child?.stopping) return child.stopping;
  if (!child?.pid || child.closed) return;
  let stopFailure;
  if (process.platform === 'win32') {
    await runCommand('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      quiet: true,
    }).catch((error) => {
      stopFailure = error;
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  await Promise.race([
    child.completion.catch(() => {}),
    delay(5_000, undefined, { ref: false }),
  ]);
  if (!child.closed && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  if (!child.closed)
    await Promise.race([
      child.completion.catch(() => {}),
      delay(5_000, undefined, { ref: false }),
    ]);
  if (!child.closed)
    throw stopFailure || new Error(`Owned process ${child.pid} did not stop.`);
};

export const withCleanup = async (operation, cleanup) => {
  let result, failure;
  try {
    result = await operation();
  } catch (error) {
    failure = error;
  }
  const outcomes = await Promise.allSettled(
    cleanup.map((action) => Promise.resolve().then(action)),
  );
  const errors = outcomes
    .filter((outcome) => outcome.status === 'rejected')
    .map((outcome) => outcome.reason);
  if (failure && !errors.length) throw failure;
  if (failure) errors.unshift(failure);
  if (errors.length)
    throw new AggregateError(
      errors,
      errors.map((error) => error.message).join('; '),
    );
  return result;
};

export const assertPortAvailable = (port) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(
        new Error(
          `Port ${port} is busy. Choose a different test port; existing services will not be stopped.`,
        ),
      ),
    );
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });

export const waitForEndpoint = async (
  url,
  child,
  { timeout = 90_000, accept = (response) => response.ok, signal } = {},
) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (child && (child.exitCode !== null || child.signalCode !== null))
      throw new Error(`Service exited before ${url} became ready.`);
    try {
      const response = await fetch(url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(2_000)])
          : AbortSignal.timeout(2_000),
      });
      if (await accept(response)) return;
    } catch {
      /* Service is still starting. */
    }
    await delay(500, undefined, { signal });
  }
  throw new Error(`Timed out waiting for ${url}.`);
};
