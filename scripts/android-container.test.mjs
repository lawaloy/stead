import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer, connect } from 'node:net';
import {
  forwardLocalDatabase,
  containerMemorySnapshot,
  saveContainerMemory,
} from './android-container-entry.mjs';
import {
  containerRunArguments,
  containerBuildArguments,
  resolveContainerBuildCache,
  runContainerAttempts,
  checkContainerEngine,
} from './android-container.mjs';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseNativeArguments } from './native-config.mjs';
import { TOOLCHAIN } from './toolchain.mjs';
import { nativeSourceIdentity } from './native-workflow.mjs';
import { runCommand } from './process-utils.mjs';
import { ROOT } from './toolchain.mjs';

test('container preflight requires a Linux engine with room for the runner and engine reserve', () => {
  checkContainerEngine(`linux ${10 * 1024 ** 3}`);
  for (const report of [
    'linux',
    'linux NaN',
    `linux ${9 * 1024 ** 3}`,
    'windows 17179869184',
  ])
    assert.throws(() => checkContainerEngine(report));
  assert.throws(
    () => checkContainerEngine('Docker Desktop is manually paused'),
    /manually paused/,
  );
});

test('container evidence records cgroup peak and OOM kills and distinguishes unavailable counters', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead memory evidence '));
  try {
    assert.deepEqual(containerMemorySnapshot(directory), {
      currentBytes: null,
      peakBytes: null,
      limitBytes: null,
      events: null,
    });
    for (const [name, value] of Object.entries({
      'memory.current': '1073741824',
      'memory.peak': '7516192768',
      'memory.max': '9663676416',
      'memory.events': 'low 0\nhigh 0\nmax 12\noom 1\noom_kill 1\n',
    }))
      writeFileSync(join(directory, name), value);
    assert.deepEqual(containerMemorySnapshot(directory), {
      currentBytes: 1073741824,
      peakBytes: 7516192768,
      limitBytes: 9663676416,
      events: { low: 0, high: 0, max: 12, oom: 1, oom_kill: 1 },
    });
    const output = join(directory, 'saved.json');
    assert.throws(
      () => saveContainerMemory(output, directory),
      /exhausting its memory budget/,
    );
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).events.oom_kill, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the real native CLI loads the container backend before rejecting an unsupported database', async () => {
  await assert.rejects(
    runCommand(
      process.execPath,
      [
        join(ROOT, 'scripts/native-workflow.mjs'),
        'verify',
        '--platform',
        'android',
        '--android-runner',
        'container',
      ],
      {
        cwd: ROOT,
        quiet: true,
        env: { ...process.env, STEAD_NATIVE_DATABASE_URL: 'unsupported' },
      },
    ),
    /remove STEAD_NATIVE_DATABASE_URL/,
  );
});

test('container repeats preserve a middle failure, finish later diagnostics and still reject the command', async () => {
  const output = mkdtempSync(join(tmpdir(), 'stead container attempts '));
  const executed = [];
  try {
    await assert.rejects(
      runContainerAttempts(
        3,
        async (attempt) => {
          executed.push(attempt);
          if (attempt === 2) throw new Error('Journey assertion failed');
        },
        { output },
      ),
      /2: Journey assertion failed/,
    );
    assert.deepEqual(executed, [1, 2, 3]);
    assert.deepEqual(
      JSON.parse(readFileSync(join(output, 'attempts.json'), 'utf8')),
      [
        { attempt: 1, status: 'passed' },
        { attempt: 2, status: 'failed', error: 'Journey assertion failed' },
        { attempt: 3, status: 'passed' },
      ],
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('cancelling container repeats records completed work and stops subsequent attempts', async () => {
  const output = mkdtempSync(join(tmpdir(), 'stead container cancellation '));
  const controller = new AbortController();
  const reason = new Error('Stop requested');
  const executed = [];
  try {
    await assert.rejects(
      runContainerAttempts(
        3,
        async (attempt) => {
          executed.push(attempt);
          controller.abort(reason);
        },
        { output, signal: controller.signal },
      ),
      (error) => error === reason,
    );
    assert.deepEqual(executed, [1]);
    assert.deepEqual(
      JSON.parse(readFileSync(join(output, 'attempts.json'), 'utf8')),
      [{ attempt: 1, status: 'passed' }],
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('an isolated image preserves source identity and distinguishes source-built and transferred APK evidence without Git', async () => {
  const source = { commit: 'a'.repeat(40), workingTreeClean: false };
  const noGit = () => {
    throw new Error('Git metadata is unavailable inside the image');
  };
  assert.deepEqual(
    await nativeSourceIdentity(
      { source, app: '/image/app.apk', sourceBuilt: true },
      noGit,
    ),
    {
      ...source,
      build: 'source',
    },
  );
  assert.deepEqual(
    await nativeSourceIdentity(
      { source, app: '/image/transferred.apk' },
      noGit,
    ),
    {
      ...source,
      build: 'provided-artifact',
    },
  );
});

test('container database forwarding carries traffic and releases sockets and ports after a failed journey', async () => {
  const upstream = createServer((socket) => socket.pipe(socket));
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  let port, closed;
  const failure = new Error('Journey failed');
  try {
    await assert.rejects(
      forwardLocalDatabase(
        async (listeningPort) => {
          port = listeningPort;
          const socket = connect(port, '127.0.0.1');
          closed = once(socket, 'close');
          await once(socket, 'connect');
          socket.write('fixture request');
          const [reply] = await once(socket, 'data');
          assert.equal(reply.toString(), 'fixture request');
          throw failure;
        },
        { host: '127.0.0.1', port: upstream.address().port, listenPort: 0 },
      ),
      (error) => error === failure,
    );
    await closed;
    const replacement = createServer();
    replacement.listen(port, '127.0.0.1');
    await once(replacement, 'listening');
    await new Promise((resolve) => replacement.close(resolve));
  } finally {
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('an occupied database proxy port fails before any fixtures are allocated', async () => {
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  let executed = false;
  try {
    await assert.rejects(
      forwardLocalDatabase(
        () => {
          executed = true;
        },
        {
          host: '127.0.0.1',
          listenPort: occupied.address().port,
        },
      ),
      { code: 'EADDRINUSE' },
    );
    assert.equal(executed, false);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});

test('container selection cannot reset a supplied device or claim iOS verification', () => {
  assert.equal(
    parseNativeArguments([
      'verify',
      '--platform',
      'android',
      '--android-runner',
      'container',
    ]).androidRunner,
    'container',
  );
  for (const args of [
    ['verify', '--android-runner', 'container'],
    ['test', '--platform', 'ios', '--android-runner', 'container'],
    ['test', '--android-runner', 'container', '--device', 'emulator-5554'],
    ['test', '--android-runner', 'unknown'],
  ])
    assert.throws(() => parseNativeArguments(args));
});

test('the container limits access to KVM and keeps the same Node patch as the host gate', () => {
  assert.match(
    TOOLCHAIN.ANDROID_CONTAINER_BASE_IMAGE,
    new RegExp(
      `^node:${TOOLCHAIN.NODE_VERSION.replaceAll('.', '\\.')}-bookworm@sha256:[a-f0-9]{64}$`,
    ),
  );
  const args = containerRunArguments({
    name: 'owned-test',
    image: 'sha256:test',
    apiPort: 3001,
    phone: '08030000002',
  });
  assert.ok(args.includes('--init'));
  assert.ok(args.includes('--device=/dev/kvm'));
  assert.ok(args.includes('--memory=9g'));
  assert.ok(args.includes('--memory-swap=9g'));
  assert.deepEqual(args.slice(-4), [
    '--api-port',
    '3001',
    '--phone',
    '08030000002',
  ]);
  assert.ok(
    !args.some((arg) =>
      /--privileged|docker\.sock|--publish|--mount|--volume/.test(arg),
    ),
  );
});

test('container builds use an explicit repository cache only when CI provides one', () => {
  assert.equal(resolveContainerBuildCache(), null);
  const cache = join(ROOT, '.tmp', 'android-buildkit-cache');
  assert.equal(resolveContainerBuildCache(cache), cache);
  for (const outside of [ROOT, join(ROOT, '.tmp'), join(ROOT, '..', 'cache')])
    assert.throws(
      () => resolveContainerBuildCache(outside),
      /dedicated directory inside the repository \.tmp directory/,
    );

  const plain = containerBuildArguments({
    context: '/source',
    image: 'stead:test',
  });
  assert.deepEqual(plain.slice(0, 3), [
    'build',
    '--progress=plain',
    '--platform=linux/amd64',
  ]);
  assert.equal(plain.includes('--cache-from'), false);
  assert.equal(plain.includes('--cache-to'), false);

  const cached = containerBuildArguments({
    context: '/source',
    image: 'stead:test',
    cacheFrom: '/cache/current',
    cacheTo: '/cache/next',
  });
  assert.deepEqual(cached.slice(0, 4), [
    'buildx',
    'build',
    '--load',
    '--progress=plain',
  ]);
  assert.ok(cached.includes('type=local,src=/cache/current'));
  assert.ok(cached.includes('type=local,dest=/cache/next,mode=max'));
});
