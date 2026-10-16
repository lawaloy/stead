import {
  mkdirSync,
  createWriteStream,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { finished } from 'node:stream/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOLCHAIN, checkJsToolchain } from './toolchain.mjs';
import { snapshotSource, scanCodeQL, checkCodeQL } from './codeql-local.mjs';
import { assertAndroidHostMemory } from './android-emulator.mjs';
import { parseNativeArguments } from './native-config.mjs';
import { runCommand, spawnOwned, withCleanup } from './process-utils.mjs';

export const containerRunArguments = ({ name, image, apiPort, phone }) => [
  'run',
  '--name',
  name,
  '--init',
  '--device=/dev/kvm',
  '--memory=7g',
  '--memory-swap=7g',
  '--add-host=host.docker.internal:host-gateway',
  image,
  '--api-port',
  String(apiPort),
  '--phone',
  phone,
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
    const os = (
      await runCommand('docker', ['info', '--format', '{{.OSType}}'], {
        quiet: true,
        signal,
      })
    ).trim();
    if (os !== 'linux')
      throw new Error(
        `Android/KVM validation requires a running, unpaused Linux Docker engine. Docker reported: ${os || 'no operating system'}`,
      );
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
    await loggedDocker(
      [
        'build',
        '--progress=plain',
        '--platform=linux/amd64',
        '--build-arg',
        `BASE_IMAGE=${TOOLCHAIN.ANDROID_CONTAINER_BASE_IMAGE}`,
        '-f',
        join(context, '.github/native-container/Dockerfile'),
        '-t',
        image,
        context,
      ],
      join(output, 'build.log'),
      signal,
    );
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
    for (let attempt = 1; attempt <= options.repeat; attempt++) {
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
          }, [
            () =>
              runCommand('docker', ['rm', '--force', name], { quiet: true }),
          ]);
        },
      ]);
    }
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    console.log(`Android container evidence: ${output}`);
  }
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  containerAndroidWorkflow(
    parseNativeArguments([
      'test',
      '--platform',
      'android',
      ...process.argv.slice(2),
    ]),
  ).catch((error) => {
    console.error(`Android container verification failed: ${error.message}`);
    process.exitCode = 1;
  });
