import { createRequire } from 'node:module';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT,
  newSchema,
  nativeDatabaseUrl,
  nativeEnvironment,
  assertOwnedSchema,
  phoneDisplay,
  bundleUrl,
  parseNativeArguments,
} from './native-config.mjs';
import { checkNativeToolchain, selectIosDevice } from './native-toolchain.mjs';
import { checkCodeQL, scanCodeQL } from './codeql-local.mjs';
import {
  assertAndroidUiHealthy,
  managedAndroidWorkflow,
} from './android-emulator.mjs';
import { iosEnvironment } from './ios-setup.mjs';
import { buildAndroidGradle } from './native-gradle.mjs';
import {
  TOOLCHAIN,
  assertToolVersion,
  checkPostgresVersion,
} from './toolchain.mjs';
import {
  assertPortAvailable,
  runCommand,
  spawnOwned,
  stopOwned,
  waitForEndpoint,
  withCleanup,
} from './process-utils.mjs';

const API = join(ROOT, 'api');
const MOBILE = join(ROOT, 'mobile');
const EXPO = join(MOBILE, 'node_modules', 'expo', 'bin', 'cli');
const BASE_DATABASE = 'postgresql://stead:stead@127.0.0.1:5432/stead';

export const withOwnedSchema = async (pool, schema, operation) => {
  assertOwnedSchema(schema);
  await pool.query(`CREATE SCHEMA "${schema}"`);
  let result, failure;
  try {
    result = await operation();
  } catch (error) {
    failure = error;
  }
  try {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  } catch (error) {
    if (failure)
      throw new AggregateError(
        [failure, error],
        `Journey failed: ${failure.message}; schema cleanup also failed: ${error.message}`,
      );
    throw error;
  }
  if (failure) throw failure;
  return result;
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

export const nativeSourceIdentity = async (options, execute = runCommand) => ({
  ...(options.source ?? {
    commit: (
      await execute('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        quiet: true,
        stdoutOnly: true,
      })
    ).trim(),
    workingTreeClean: !(
      await execute('git', ['status', '--porcelain'], {
        cwd: ROOT,
        quiet: true,
        stdoutOnly: true,
      })
    ).trim(),
  }),
  build: options.sourceBuilt || !options.app ? 'source' : 'provided-artifact',
});

export const prepareIosSimulator = async (id, app, execute = runCommand) => {
  const listing = JSON.parse(
    await execute(
      'xcrun',
      ['simctl', 'list', 'devices', 'available', '--json'],
      { quiet: true, stdoutOnly: true },
    ),
  );
  const current = selectIosDevice(listing, id);
  if (current.state !== 'Booted')
    await execute('xcrun', ['simctl', 'boot', id]);
  await execute('xcrun', ['simctl', 'bootstatus', id, '-b']);
  await execute('xcrun', ['simctl', 'install', id, app]);
};

const buildApp = async (platform, signal, projectReady = false) => {
  const { tools } = await checkNativeToolchain(platform, {
    requireDevice: false,
    requireMaestro: false,
    execute: (command, args, options) =>
      runCommand(command, args, { ...options, signal }),
  });
  let env = { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' };
  if (platform === 'ios') env = iosEnvironment(env);
  if (!projectReady)
    await runCommand(
      process.execPath,
      [EXPO, 'prebuild', '--platform', platform, '--no-install'],
      { cwd: MOBILE, env, signal },
    );
  const destination = join(MOBILE, '.ci', platform);
  mkdirSync(destination, { recursive: true });
  if (platform === 'android') {
    const wrapper = readFileSync(
      join(MOBILE, 'android/gradle/wrapper/gradle-wrapper.properties'),
      'utf8',
    );
    assertToolVersion(
      'Gradle wrapper',
      wrapper.match(/gradle-([\d.]+)-bin\.zip/)?.[1],
      TOOLCHAIN.GRADLE_VERSION,
    );
    await buildAndroidGradle({
      directory: join(MOBILE, 'android'),
      sdk: tools.sdk,
      env,
      signal,
    });
    const app = join(destination, 'stead-debug.apk');
    copyFileSync(
      join(
        MOBILE,
        'android',
        'app',
        'build',
        'outputs',
        'apk',
        'debug',
        'app-debug.apk',
      ),
      app,
    );
    return app;
  }
  await runCommand(
    'bash',
    [join(ROOT, '.github/scripts/build-ios-simulator-app.sh')],
    { cwd: ROOT, env, signal },
  );
  return join(destination, 'mobile.app');
};

const logService = (command, args, path, options) => {
  const log = createWriteStream(path);
  const child = spawnOwned(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.completion.finally(() => log.end()).catch(() => {});
  return child;
};

const runAttempt = async (platform, options, tools, app, pool, directory) => {
  options.signal?.throwIfAborted();
  if (platform === 'android') {
    const healthy = assertAndroidUiHealthy(
      await runCommand(
        tools.adb,
        ['-s', tools.device, 'shell', 'dumpsys', 'window'],
        { quiet: true, stdoutOnly: true, signal: options.signal },
      ),
    );
    if (!healthy)
      throw new Error(
        'Android emulator has no focused window. Wait for a UI-ready emulator before running the journey.',
      );
  }
  if (
    platform === 'android' &&
    (
      await runCommand(
        tools.adb,
        ['-s', tools.device, 'shell', 'getprop', 'sys.boot_completed'],
        { quiet: true, signal: options.signal },
      )
    ).trim() !== '1'
  )
    throw new Error(
      'Android emulator is not boot-ready. Restore emulator health before starting another attempt.',
    );
  await assertPortAvailable(options.apiPort);
  await assertPortAvailable(options.metroPort);
  const schema = newSchema();
  const base = process.env.STEAD_NATIVE_DATABASE_URL || BASE_DATABASE;
  const databaseUrl = nativeDatabaseUrl(base, schema);
  let env = nativeEnvironment({ ...options, databaseUrl });
  if (platform === 'ios') env = iosEnvironment(env);
  const apiUrl = `http://127.0.0.1:${options.apiPort}`;
  const metroUrl = `http://127.0.0.1:${options.metroPort}`;
  mkdirSync(directory, { recursive: true });
  return withOwnedSchema(pool, schema, async () => {
    let api, metro;
    const reverse = [];
    const animations = [];
    const adb = (args, config = {}) =>
      runCommand(tools.adb, ['-s', tools.device, ...args], config);
    return withCleanup(async () => {
      await runCommand('npm', ['exec', '--', 'prisma', 'migrate', 'deploy'], {
        cwd: API,
        env,
        signal: options.signal,
      });
      api = logService(
        process.execPath,
        ['dist/src/main.js'],
        join(directory, 'api.log'),
        { cwd: API, env, signal: options.signal },
      );
      await waitForEndpoint(`${apiUrl}/auth/countries`, api, {
        signal: options.signal,
      });
      metro = logService(
        process.execPath,
        [EXPO, 'start', '--localhost', '--port', String(options.metroPort)],
        join(directory, 'metro.log'),
        {
          cwd: MOBILE,
          signal: options.signal,
          env: {
            ...env,
            NODE_ENV: 'development',
            NODE_OPTIONS: [env.NODE_OPTIONS, '--dns-result-order=ipv4first']
              .filter(Boolean)
              .join(' '),
          },
        },
      );
      await waitForEndpoint(`${metroUrl}/status`, metro, {
        signal: options.signal,
        accept: async (response) =>
          response.ok &&
          (await response.text()).includes('packager-status:running'),
      });
      const appId = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8'))
        .expo[platform === 'android' ? 'android' : 'ios'][
        platform === 'android' ? 'package' : 'bundleIdentifier'
      ];
      const bundle = await fetch(
        bundleUrl(platform, options.metroPort, appId),
        {
          signal: AbortSignal.any([
            AbortSignal.timeout(240_000),
            options.signal,
          ]),
        },
      );
      if (!bundle.ok)
        throw new Error(
          `Metro bundle prewarm failed with HTTP ${bundle.status}. See metro.log.`,
        );
      const bytes = Buffer.from(await bundle.arrayBuffer());
      if (!bytes.length) throw new Error('Metro returned an empty bundle.');
      writeFileSync(join(directory, 'prewarm.bundle'), bytes);
      if (platform === 'android') {
        for (const key of [
          'window_animation_scale',
          'transition_animation_scale',
          'animator_duration_scale',
        ]) {
          const previous = (
            await adb(['shell', 'settings', 'get', 'global', key], {
              quiet: true,
              signal: options.signal,
            })
          ).trim();
          animations.push({ key, previous });
          await adb(['shell', 'settings', 'put', 'global', key, '0'], {
            quiet: true,
            signal: options.signal,
          });
        }
        const existing = await adb(['reverse', '--list']);
        for (const port of [options.apiPort, options.metroPort]) {
          const key = `tcp:${port}`;
          const mapping = existing
            .split(/\r?\n/)
            .map((line) => line.trim().split(/\s+/))
            .find((parts) => parts.at(-2) === key);
          if (mapping && mapping.at(-1) !== key)
            throw new Error(
              `Emulator forwarding for ${key} belongs to another service.`,
            );
          if (!mapping) {
            await adb(['reverse', key, key]);
            reverse.push(key);
          }
        }
        await adb(['install', '-r', app]);
      } else {
        const id = tools.simulator.udid;
        await prepareIosSimulator(id, app, (command, args, config) =>
          runCommand(command, args, { ...config, env, signal: options.signal }),
        );
      }
      const device =
        platform === 'android' ? tools.device : tools.simulator.udid;
      await runCommand(
        tools.maestro,
        [
          'test',
          '--device',
          device,
          '--platform',
          platform,
          '--format',
          'JUNIT',
          '--output',
          join(directory, 'results.xml'),
          '--debug-output',
          join(directory, 'maestro'),
          '-e',
          `TEST_PHONE_DISPLAY=${phoneDisplay(options.phone)}`,
          join(MOBILE, '.maestro', 'critical-native-journey.yaml'),
        ],
        { cwd: MOBILE, env, signal: options.signal },
      );
      return { schema, directory };
    }, [
      () => stopOwned(metro),
      () => stopOwned(api),
      async () => {
        await withCleanup(async () => {}, [
          ...reverse.map(
            (key) => () => adb(['reverse', '--remove', key], { quiet: true }),
          ),
          ...animations.map(
            ({ key, previous }) =>
              () =>
                adb(
                  [
                    'shell',
                    'settings',
                    previous === 'null' ? 'delete' : 'put',
                    'global',
                    key,
                    ...(previous === 'null' ? [] : [previous]),
                  ],
                  { quiet: true },
                ),
          ),
        ]);
      },
    ]);
  });
};

export const nativeWorkflow = async (options) => {
  const controller = new AbortController();
  const abort = () =>
    controller.abort(new Error('Native verification interrupted.'));
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  options = { ...options, signal: controller.signal };
  try {
    const platforms =
      options.platform === 'all' ? ['android', 'ios'] : [options.platform];
    const checked = [];
    // Complete preflight before builds, schema allocation, or device changes.
    for (const platform of platforms)
      checked.push(
        await checkNativeToolchain(platform, {
          ...options,
          execute: (command, args, config) =>
            runCommand(command, args, { ...config, signal: options.signal }),
          requireDevice: options.command !== 'build' && !options.prepareOnly,
          requireMaestro: options.command !== 'build',
          requireBuild:
            options.command === 'doctor' ||
            options.command === 'build' ||
            !options.app,
        }),
      );
    console.log(
      JSON.stringify(
        checked.map(({ metadata }) => metadata),
        null,
        2,
      ),
    );
    if (options.command === 'doctor') return;
    if (options.command === 'build') {
      for (const platform of platforms)
        console.log(
          `Built ${await buildApp(platform, options.signal, options.projectReady)}`,
        );
      return;
    }
    await assertPortAvailable(options.apiPort);
    await assertPortAvailable(options.metroPort);
    if (options.command === 'verify') {
      await checkCodeQL({ signal: options.signal });
      await runCommand('npm', ['run', 'dependencies:check'], {
        cwd: ROOT,
        signal: options.signal,
      });
      await runCommand('npm', ['run', 'verify:full'], {
        cwd: ROOT,
        signal: options.signal,
        env: { ...process.env, STEAD_TEST_API_PORT: String(options.apiPort) },
      });
      await scanCodeQL({ signal: options.signal });
    }
    if (options.prepareOnly) {
      const app = options.app
        ? resolve(options.app)
        : await buildApp('android', options.signal, options.projectReady);
      if (!existsSync(app))
        throw new Error(`Native app artifact is missing: ${app}`);
      return {
        app,
        sourceBuilt: options.sourceBuilt || !options.app,
        metadata: checked[0].metadata,
      };
    }
    if (!options.databaseReady) {
      await runCommand('npm', ['run', 'db:start'], {
        cwd: ROOT,
        signal: options.signal,
      });
    }
    await runCommand('npm', ['run', 'build'], {
      cwd: API,
      signal: options.signal,
    });
    const apiRequire = createRequire(join(API, 'package.json'));
    const { Pool } = apiRequire('pg');
    const base = process.env.STEAD_NATIVE_DATABASE_URL || BASE_DATABASE;
    nativeDatabaseUrl(base, newSchema());
    const pool = new Pool({ connectionString: base });
    const output = join(
      ROOT,
      '.tmp',
      'native-validation',
      `${Date.now()}-${randomBytes(4).toString('hex')}`,
    );
    const results = [];
    const source = await nativeSourceIdentity(options);
    try {
      const postgres = await checkPostgresVersion(pool);
      for (let index = 0; index < platforms.length; index += 1) {
        const platform = platforms[index];
        const app = options.app
          ? resolve(options.app)
          : await buildApp(platform, options.signal);
        if (!existsSync(app))
          throw new Error(`Native app artifact is missing: ${app}`);
        const metadata = {
          ...options.buildMetadata,
          ...checked[index].metadata,
          postgres,
        };
        const attempts = await repeatJourneys(
          options.repeat,
          (attempt) =>
            runAttempt(
              platform,
              options,
              checked[index].tools,
              app,
              pool,
              join(output, platform, `attempt-${attempt}`),
            ),
          options.signal,
        );
        const artifact = platform === 'android' ? app : join(app, 'mobile');
        results.push({
          ...metadata,
          app,
          artifactSha256: createHash('sha256')
            .update(readFileSync(artifact))
            .digest('hex'),
          attempts,
        });
        mkdirSync(output, { recursive: true });
        writeFileSync(
          join(output, 'results.json'),
          JSON.stringify({ source, results }, null, 2),
        );
      }
    } finally {
      await pool.end();
    }
    console.log(`Native evidence: ${output}`);
    options.signal.throwIfAborted();
    const failures = results
      .flatMap((result) => result.attempts)
      .filter((attempt) => attempt.status !== 'passed');
    if (failures.length)
      throw new Error(
        `${failures.length} native attempt(s) failed. Original failures are retained; later passes do not erase them.`,
      );
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const options = parseNativeArguments(process.argv.slice(2));
  const operation =
    options.androidRunner === 'container'
      ? (await import('./android-container.mjs')).containerAndroidWorkflow
      : options.command === 'verify' &&
          options.platform === 'android' &&
          !options.device
        ? managedAndroidWorkflow
        : nativeWorkflow;
  operation(options).catch((error) => {
    console.error(`Native verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
