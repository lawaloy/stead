import {
  mkdirSync,
  createWriteStream,
  writeFileSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT, TOOLCHAIN, checkJsToolchain } from './toolchain.mjs';
import { snapshotSource, scanCodeQL, checkCodeQL } from './codeql-local.mjs';
import { assertAndroidHostMemory } from './android-emulator.mjs';
import { runCommand, spawnOwned, withCleanup } from './process-utils.mjs';
import { repeatJourneys } from './native-attempts.mjs';

const CONTAINER_MEMORY_GIB = 9;
export const checkContainerEngine = (report) => {
  const [os, bytes] = report.trim().split(/\s+/);
  if (os !== 'linux')
    throw new Error(
      `Android/KVM validation requires a running, unpaused Linux Docker engine. Docker reported: ${report || 'no operating system'}`,
    );
  if (
    Number(bytes) < (CONTAINER_MEMORY_GIB + 1) * 1024 ** 3 ||
    !Number.isSafeInteger(Number(bytes))
  )
    throw new Error(
      `The Docker engine needs at least ${CONTAINER_MEMORY_GIB + 1} GiB memory (${CONTAINER_MEMORY_GIB} GiB runner and 1 GiB engine reserve). Docker reported: ${report}`,
    );
};

export const runContainerAttempts = async (
  count,
  operation,
  { output, signal },
) => {
  const attempts = await repeatJourneys(count, operation, signal);
  writeFileSync(
    join(output, 'attempts.json'),
    JSON.stringify(attempts, null, 2),
  );
  signal?.throwIfAborted();
  const failures = attempts.filter((attempt) => attempt.status === 'failed');
  if (failures.length)
    throw new Error(
      `Android container attempts failed: ${failures.map((attempt) => `${attempt.attempt}: ${attempt.error}`).join('; ')}. See ${output}`,
    );
  return attempts;
};

export const containerRunArguments = ({ name, image, apiPort, phone }) => [
  'run',
  '--name',
  name,
  '--init',
  '--device=/dev/kvm',
  `--memory=${CONTAINER_MEMORY_GIB}g`,
  `--memory-swap=${CONTAINER_MEMORY_GIB}g`,
  '--add-host=host.docker.internal:host-gateway',
  image,
  '--api-port',
  String(apiPort),
  '--phone',
  phone,
];

export const resolveContainerBuildCache = (value, root = ROOT) => {
  if (!value) return null;
  const temporaryRoot = resolve(root, '.tmp');
  const cache = resolve(root, value);
  const within = relative(temporaryRoot, cache);
  if (
    !within ||
    isAbsolute(within) ||
    within === '..' ||
    within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  )
    throw new Error(
      'STEAD_ANDROID_BUILDKIT_CACHE must select a dedicated directory inside the repository .tmp directory.',
    );
  return cache;
};

export const containerBuildArguments = ({
  context,
  image,
  cacheFrom,
  cacheTo,
}) => [
  ...(cacheTo ? ['buildx', 'build', '--load'] : ['build']),
  '--progress=plain',
  '--platform=linux/amd64',
  ...(cacheFrom ? ['--cache-from', `type=local,src=${cacheFrom}`] : []),
  ...(cacheTo ? ['--cache-to', `type=local,dest=${cacheTo},mode=max`] : []),
  '--build-arg',
  `BASE_IMAGE=${TOOLCHAIN.ANDROID_CONTAINER_BASE_IMAGE}`,
  '-f',
  join(context, '.github/native-container/Dockerfile'),
  '-t',
  image,
  context,
];

const loggedDocker = async (args, file, signal) => {
  const log = createWriteStream(file);
  const child = spawnOwned('docker', args, {
    signal,
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.stdout.pipe(process.stdout, { end: false });
  child.stderr.pipe(process.stderr, { end: false });
  try {
    await child.completion;
    signal?.throwIfAborted();
  } finally {
    log.end();
    await finished(log);
  }
};

export const containerAndroidWorkflow = async (options) => {
  if (
    options.platform !== 'android' ||
    options.device ||
    options.command === 'doctor'
  )
    throw new Error(
      'The container runner requires Android and owns its emulator.',
    );
  if (process.env.STEAD_NATIVE_DATABASE_URL)
    throw new Error(
      'The container runner uses the local Compose test database; remove STEAD_NATIVE_DATABASE_URL.',
    );
  if (options.projectReady)
    throw new Error(
      'The container build owns Expo prebuild; omit --project-ready.',
    );
  const controller = new AbortController();
  const abort = () =>
    controller.abort(new Error('Android container verification interrupted.'));
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const { signal } = controller;
  const output = join(
    ROOT,
    '.tmp/native-container',
    `${Date.now()}-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(output, { recursive: true });
  try {
    assertAndroidHostMemory();
    await checkJsToolchain();
    const engine = (
      await runCommand(
        'docker',
        ['info', '--format', '{{.OSType}} {{.MemTotal}}'],
        {
          quiet: true,
          signal,
        },
      )
    ).trim();
    checkContainerEngine(engine);
    await runCommand(
      'docker',
      [
        'run',
        '--rm',
        '--device=/dev/kvm',
        TOOLCHAIN.ANDROID_CONTAINER_BASE_IMAGE,
        'node',
        '-e',
        'require("fs").closeSync(require("fs").openSync("/dev/kvm", "r+"))',
      ],
      { signal },
    );
    if (options.command === 'verify') {
      await checkCodeQL({ signal });
      await runCommand('npm', ['run', 'dependencies:check'], {
        cwd: ROOT,
        signal,
      });
      await runCommand('npm', ['run', 'verify:full'], {
        cwd: ROOT,
        signal,
        env: { ...process.env, STEAD_TEST_API_PORT: String(options.apiPort) },
      });
      await scanCodeQL({ signal });
    }
    const source = {
      commit: (
        await runCommand('git', ['rev-parse', 'HEAD'], {
          cwd: ROOT,
          quiet: true,
          stdoutOnly: true,
          signal,
        })
      ).trim(),
      workingTreeClean: !(
        await runCommand('git', ['status', '--porcelain'], {
          cwd: ROOT,
          quiet: true,
          stdoutOnly: true,
          signal,
        })
      ).trim(),
      providedApp: !!options.app,
    };
    const context = join(output, 'source');
    await snapshotSource(ROOT, context);
    writeFileSync(join(context, '.stead-source.json'), JSON.stringify(source));
    writeFileSync(join(output, 'source.json'), JSON.stringify(source, null, 2));
    if (options.app)
      copyFileSync(resolve(options.app), join(context, '.stead-app.apk'));
    const image = `stead-native-android:${randomBytes(8).toString('hex')}`;
    const buildCache = resolveContainerBuildCache(
      process.env.STEAD_ANDROID_BUILDKIT_CACHE,
    );
    const nextBuildCache = buildCache
      ? `${buildCache}.next-${randomBytes(4).toString('hex')}`
      : null;
    if (nextBuildCache)
      await rm(nextBuildCache, { recursive: true, force: true });
    try {
      await loggedDocker(
        containerBuildArguments({
          context,
          image,
          cacheFrom:
            buildCache && existsSync(join(buildCache, 'index.json'))
              ? buildCache
              : null,
          cacheTo: nextBuildCache,
        }),
        join(output, 'build.log'),
        signal,
      );
      if (buildCache) {
        await rm(buildCache, { recursive: true, force: true });
        await rename(nextBuildCache, buildCache);
      }
    } catch (error) {
      if (nextBuildCache)
        await rm(nextBuildCache, { recursive: true, force: true });
      throw error;
    }
    const imageId = (
      await runCommand(
        'docker',
        ['image', 'inspect', image, '--format', '{{.Id}}'],
        { quiet: true, stdoutOnly: true, signal },
      )
    ).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId))
      throw new Error('Docker did not return an immutable image identifier.');
    writeFileSync(
      join(output, 'source.json'),
      JSON.stringify({ ...source, imageId }, null, 2),
    );
    if (options.command === 'build') {
      const name = `stead-native-export-${randomBytes(6).toString('hex')}`;
      await runCommand('docker', ['create', '--name', name, imageId], {
        signal,
      });
      await withCleanup(async () => {
        const destination = join(ROOT, 'mobile/.ci/android');
        mkdirSync(destination, { recursive: true });
        await runCommand(
          'docker',
          [
            'cp',
            `${name}:/stead/mobile/.ci/android/stead-debug.apk`,
            join(destination, 'stead-debug.apk'),
          ],
          { signal },
        );
      }, [() => runCommand('docker', ['rm', name], { quiet: true })]);
      return;
    }
    if (!options.databaseReady)
      await runCommand('npm', ['run', 'db:start'], { cwd: ROOT, signal });
    await runContainerAttempts(
      options.repeat,
      async (attempt) => {
        signal.throwIfAborted();
        const name = `stead-native-android-${randomBytes(8).toString('hex')}`;
        const directory = join(output, `attempt-${attempt}`);
        mkdirSync(directory, { recursive: true });
        let passed = false;
        await withCleanup(async () => {
          await loggedDocker(
            containerRunArguments({
              name,
              image: imageId,
              apiPort: options.apiPort,
              phone: options.phone,
            }),
            join(directory, 'container.log'),
            signal,
          );
          passed = true;
        }, [
          async () => {
            // Allow the shared runner to drop its schema and stop services before removal.
            await withCleanup(async () => {
              await runCommand('docker', ['stop', '--time', '30', name], {
                quiet: true,
              }).catch((error) => {
                if (passed) throw error;
              });
              for (const kind of ['native-validation', 'emulator-validation'])
                await runCommand(
                  'docker',
                  ['cp', `${name}:/stead/.tmp/${kind}`, directory],
                  { quiet: true },
                ).catch((error) => {
                  if (passed) throw error;
                });
              await runCommand(
                'docker',
                [
                  'cp',
                  `${name}:/stead/.tmp/container-memory.json`,
                  join(directory, 'memory.json'),
                ],
                { quiet: true },
              ).catch((error) => {
                if (passed) throw error;
              });
            }, [
              () =>
                runCommand('docker', ['rm', '--force', name], { quiet: true }),
            ]);
          },
        ]);
      },
      { output, signal },
    );
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    console.log(`Android container evidence: ${output}`);
  }
};
