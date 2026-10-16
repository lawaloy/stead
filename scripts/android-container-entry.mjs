import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { managedAndroidWorkflow } from './android-emulator.mjs';
import { nativeWorkflow } from './native-workflow.mjs';
import { parseNativeArguments } from './native-config.mjs';
import { ROOT } from './toolchain.mjs';
import { withCleanup } from './process-utils.mjs';

export const containerMemorySnapshot = (directory = '/sys/fs/cgroup') => {
  const read = (name) => {
    try {
      return readFileSync(join(directory, name), 'utf8').trim();
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const bytes = (name) => {
    const value = read(name);
    return value === null || value === 'max' ? value : Number(value);
  };
  const events = read('memory.events');
  return {
    currentBytes: bytes('memory.current'),
    peakBytes: bytes('memory.peak'),
    limitBytes: bytes('memory.max'),
    events:
      events === null
        ? null
        : Object.fromEntries(
            events
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const [name, count] = line.split(/\s+/);
                return [name, Number(count)];
              }),
          ),
  };
};

export const saveContainerMemory = (output, directory) => {
  const memory = containerMemorySnapshot(directory);
  writeFileSync(output, JSON.stringify(memory, null, 2));
  if (memory.events?.oom_kill > 0)
    throw new Error(
      `The Android container killed a process after exhausting its memory budget. See ${output}`,
    );
};

export const forwardLocalDatabase = async (
  operation,
  { host = 'host.docker.internal', port = 5432, listenPort = 5432 } = {},
) => {
  const connections = new Set();
  const server = createServer((socket) => {
    const upstream = connect(port, host);
    for (const stream of [socket, upstream]) {
      connections.add(stream);
      stream.once('close', () => connections.delete(stream));
      stream.on('error', () => {
        socket.destroy();
        upstream.destroy();
      });
    }
    socket.pipe(upstream).pipe(socket);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', resolve);
  });
  try {
    return await operation(server.address().port);
  } finally {
    for (const socket of connections) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
};

const main = async () => {
  const source = JSON.parse(
    readFileSync(join(ROOT, '.stead-source.json'), 'utf8'),
  );
  if (
    !/^[a-f0-9]{40}$/.test(source.commit) ||
    typeof source.workingTreeClean !== 'boolean' ||
    typeof source.providedApp !== 'boolean'
  )
    throw new Error('Container source identity is missing or invalid.');
  const options = parseNativeArguments([
    'test',
    '--platform',
    'android',
    ...process.argv.slice(2),
  ]);
  if (options.device || options.app || options.repeat !== 1)
    throw new Error(
      'The container entry owns one fresh emulator and its image-built APK.',
    );
  await withCleanup(
    () =>
      forwardLocalDatabase(() =>
        managedAndroidWorkflow(
          {
            ...options,
            databaseReady: true,
            app: join(ROOT, 'mobile/.ci/android/stead-debug.apk'),
            sourceBuilt: !source.providedApp,
            source,
          },
          { workflow: nativeWorkflow },
        ),
      ),
    [
      () => {
        mkdirSync(join(ROOT, '.tmp'), { recursive: true });
        saveContainerMemory(join(ROOT, '.tmp/container-memory.json'));
      },
    ],
  );
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(`Android container verification failed: ${error.message}`);
    process.exitCode = 1;
  });
