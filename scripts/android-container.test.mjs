import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer, connect } from 'node:net';
import { forwardLocalDatabase } from './android-container-entry.mjs';
import { containerRunArguments } from './android-container.mjs';
import { parseNativeArguments } from './native-config.mjs';
import { TOOLCHAIN } from './toolchain.mjs';
import { nativeSourceIdentity } from './native-workflow.mjs';

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
