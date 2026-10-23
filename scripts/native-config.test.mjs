import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nativeDatabaseUrl,
  assertOwnedSchema,
  newSchema,
  nativeEnvironment,
  parseNativeArguments,
  phoneDisplay,
  bundleUrl,
  ROOT,
  TOOLCHAIN,
} from './native-config.mjs';
import {
  selectAndroidDevice,
  selectIosDevice,
  checkNativeToolchain,
  checkAndroidBuildSdk,
} from './native-toolchain.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMaestroCommand } from './native-attempts.mjs';

test('a hung Maestro process is stopped and reported as a failed attempt', async () => {
  const attempts = await repeatJourneys(2, async (attempt) => {
    if (attempt === 1)
      await runMaestroCommand(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        { quiet: true },
        { timeoutMs: 200 },
      );
  });
  assert.deepEqual(
    attempts.map((attempt) => attempt.status),
    ['failed', 'passed'],
  );
  assert.match(
    attempts[0].error,
    /Maestro exceeded its 200 ms process deadline/,
  );
});

test('the Maestro deadline preserves caller cancellation and validates its budget before spawning', async () => {
  const controller = new AbortController();
  const reason = new Error('User cancelled validation');
  controller.abort(reason);
  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      { signal: controller.signal },
      {
        execute: async (_command, _args, { signal }) => signal.throwIfAborted(),
      },
    ),
    (error) => error === reason,
  );
  for (const timeoutMs of [0, -1, NaN])
    await assert.rejects(
      runMaestroCommand('unused', [], {}, { timeoutMs }),
      /positive integer/,
    );
});

test('Android build preflight rejects missing packages and different SDK revisions', () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead sdk '));
  try {
    assert.throws(() => checkAndroidBuildSdk(sdk), /Install SDK package/);
    for (const [name, version, revision = version] of [
      ['build-tools', TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION],
      ['build-tools', TOOLCHAIN.ANDROID_MODULE_BUILD_TOOLS_VERSION],
      ['ndk', TOOLCHAIN.ANDROID_NDK_VERSION],
      ['cmake', TOOLCHAIN.ANDROID_CMAKE_VERSION],
      [
        'platforms',
        `android-${TOOLCHAIN.ANDROID_COMPILE_SDK}`,
        TOOLCHAIN.ANDROID_PLATFORM_REVISION,
      ],
    ]) {
      const directory = join(sdk, name, version);
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'source.properties'),
        `Pkg.Revision = ${revision}\n`,
      );
    }
    assert.equal(checkAndroidBuildSdk(sdk).ndk, TOOLCHAIN.ANDROID_NDK_VERSION);
    writeFileSync(
      join(
        sdk,
        'platforms',
        `android-${TOOLCHAIN.ANDROID_COMPILE_SDK}`,
        'source.properties',
      ),
      'Pkg.Revision=999\n',
    );
    assert.throws(() => checkAndroidBuildSdk(sdk), /match CI/);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('a different Java patch or distribution cannot pass native preflight', async () => {
  for (const java of [
    'openjdk version "21.0.1"\nOpenJDK Runtime Environment Temurin-21.0.1+1',
    'openjdk version "17.0.20.1"\nOpenJDK Runtime Environment OtherVendor-17.0.20.1+1',
  ])
    await assert.rejects(
      checkNativeToolchain('android', {
        requireDevice: false,
        requireMaestro: false,
        requireBuild: false,
        env: { ANDROID_HOME: ROOT },
        execute: async (command) =>
          command === 'npm' ? TOOLCHAIN.NPM_VERSION : java,
      }),
      /Use Eclipse Temurin/,
    );
});
import {
  withOwnedSchema,
  repeatJourneys,
  runNativeCommand,
} from './native-workflow.mjs';

test('one native entry point preserves prepared, managed, container, build, setup and remote ownership', async () => {
  const calls = [];
  const handlers = Object.fromEntries(
    ['local', 'managed', 'container', 'setup', 'remote'].map((name) => [
      name,
      async (options) => calls.push({ name, options }),
    ]),
  );
  for (const [args, expected] of [
    [['doctor', '--platform', 'ios'], 'local'],
    [['build', '--platform', 'android', '--project-ready'], 'local'],
    [['test', '--platform', 'ios', '--repeat', '3'], 'local'],
    [['test', '--device', 'emulator-5554'], 'local'],
    [['test', '--android-runner', 'managed'], 'managed'],
    [
      [
        'test',
        '--android-runner',
        'container',
        '--database-ready',
        '--app',
        'source.apk',
      ],
      'container',
    ],
    [['verify', '--platform', 'android'], 'managed'],
    [['verify', '--platform', 'ios'], 'local'],
    [['setup', '--platform', 'ios'], 'setup'],
    [['remote-ios'], 'remote'],
  ]) {
    const original = [...args];
    await runNativeCommand(args, handlers);
    assert.equal(calls.at(-1).name, expected);
    assert.deepEqual(
      args,
      original,
      'dispatch must not mutate caller arguments',
    );
    if (args[0] === 'test' && args.includes('--app')) {
      assert.equal(calls.at(-1).options.app, 'source.apk');
      assert.equal(calls.at(-1).options.databaseReady, true);
    }
  }
  assert.equal(calls[2].options.repeat, 3);
  assert.equal(calls[1].options.projectReady, true);
});

test('ambiguous native actions fail before any device, remote push or setup operation', async () => {
  let executions = 0;
  const handlers = Object.fromEntries(
    ['local', 'managed', 'container', 'setup', 'remote'].map((name) => [
      name,
      async () => {
        executions++;
      },
    ]),
  );
  for (const args of [
    ['remote-ios', '--repeat', '1'],
    ['remote-ios', '--platform', 'android'],
    ['setup'],
    ['setup', '--platform', 'android'],
    ['setup', '--platform', 'ios', '--device', 'personal'],
    ['test', '--platform', 'ios', '--android-runner', 'managed'],
    ['test', '--android-runner', 'managed', '--device', 'emulator-5554'],
    ['build', '--android-runner', 'container'],
    ['doctor', '--android-runner', 'managed'],
    ['unknown'],
    ['help', '--platform', 'ios'],
  ])
    await assert.rejects(runNativeCommand(args, handlers));
  assert.equal(executions, 0);
  assert.deepEqual(parseNativeArguments([]), { command: 'help' });
});

test('native fixtures cannot target remote databases or modify an unowned schema', () => {
  const schema = newSchema();
  const url = new URL(
    nativeDatabaseUrl(
      'postgresql://stead:stead@localhost:5432/stead?schema=public',
      schema,
    ),
  );
  assert.equal(url.searchParams.get('schema'), schema);
  for (const unsafe of [
    'public',
    'e2e',
    'e2e_native_public',
    `${schema}";DROP SCHEMA public`,
  ])
    assert.throws(() => assertOwnedSchema(unsafe));
  assert.throws(() =>
    nativeDatabaseUrl(
      'postgresql://stead:stead@production.example/stead',
      schema,
    ),
  );
  assert.throws(() => nativeDatabaseUrl('https://localhost/stead', schema));
  assert.throws(() => nativeDatabaseUrl('postgresql://localhost/', schema));
  const schemas = Array.from({ length: 100 }, newSchema);
  assert.equal(new Set(schemas).size, schemas.length);
});

test('native environment replaces production selectors and disables operator access without changing its input', () => {
  const inherited = {
    DATABASE_URL: 'production',
    E2E_DATABASE_URL: 'public',
    NODE_ENV: 'production',
    AUTH_INSPECTION_OPERATOR_USER_IDS: 'operator',
    SMS_PROVIDER: 'twilio',
    EXPO_PUBLIC_API_URL: 'production',
    EXPO_NO_DOTENV: '0',
  };
  const env = nativeEnvironment(
    {
      databaseUrl: 'isolated',
      apiPort: 3001,
      metroPort: 8082,
      phone: '08030000001',
    },
    inherited,
  );
  assert.equal(env.DATABASE_URL, 'isolated');
  assert.equal(env.E2E_DATABASE_URL, undefined);
  assert.equal(env.AUTH_INSPECTION_OPERATOR_USER_IDS, '');
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.SMS_PROVIDER, 'dev');
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.EXPO_PUBLIC_API_URL, 'http://127.0.0.1:3001');
  assert.equal(inherited.DATABASE_URL, 'production');
  assert.equal(
    new Set([
      env.JWT_SECRET,
      env.NOTIFICATION_PAYLOAD_ENCRYPTION_KEY,
      env.AUTH_DEVICE_IDENTIFIER_SECRET,
    ]).size,
    3,
  );
});

test('schema cleanup runs when the journey fails and public is never queried', async () => {
  const calls = [];
  const pool = { query: async (sql) => calls.push(sql) };
  const schema = newSchema();
  await assert.rejects(
    withOwnedSchema(pool, schema, async () => {
      throw new Error('gesture failed');
    }),
    /gesture failed/,
  );
  assert.deepEqual(calls, [
    `CREATE SCHEMA "${schema}"`,
    `DROP SCHEMA "${schema}" CASCADE`,
  ]);
  await assert.rejects(withOwnedSchema(pool, 'public', async () => {}));
  assert.equal(calls.length, 2);
});

test('a schema creation failure never drops an existing schema', async () => {
  const calls = [];
  await assert.rejects(
    withOwnedSchema(
      {
        query: async (sql) => {
          calls.push(sql);
          throw new Error('already exists');
        },
      },
      newSchema(),
      async () => {},
    ),
    /already exists/,
  );
  assert.equal(calls.length, 1);
});

test('schema cleanup errors cannot erase a failed journey', async () => {
  let queries = 0;
  await assert.rejects(
    withOwnedSchema(
      {
        query: async () => {
          if (++queries === 2) throw new Error('drop failed');
        },
      },
      newSchema(),
      async () => {
        throw new Error('journey failed');
      },
    ),
    (error) => {
      assert.equal(error.errors.length, 2);
      assert.match(error.message, /journey failed.*drop failed/);
      return true;
    },
  );
});

test('repeated runs retain failures and allocate independent operations rather than turning a retry into success', async () => {
  const calls = [];
  const results = await repeatJourneys(3, async (attempt) => {
    calls.push(attempt);
    if (attempt === 1) throw new Error('first run failed');
    return { schema: newSchema() };
  });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(
    results.map((result) => result.status),
    ['failed', 'passed', 'passed'],
  );
  assert.match(results[0].error, /first run failed/);
  assert.notEqual(results[1].schema, results[2].schema);
});

test('cancellation stops scheduling repeat attempts', async () => {
  const controller = new AbortController();
  const results = await repeatJourneys(
    3,
    async () => {
      controller.abort();
      throw new Error('cancelled');
    },
    controller.signal,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'failed');
});

test('arguments reject unsupported platforms, ambiguous artifacts, and unsafe ports before starting services', () => {
  assert.deepEqual(
    parseNativeArguments(['test', '--api-port=3001', '--repeat', '3']).repeat,
    3,
  );
  assert.equal(parseNativeArguments(['verify']).platform, 'all');
  for (const args of [
    ['test', '--platform', 'web'],
    ['test', '--repeat', '0'],
    ['test', '--repeat', '21'],
    ['test', '--api-port', '3001oops'],
    ['test', '--api-port', '8081'],
    ['test', '--app'],
    ['test', '--mystery'],
    ['test', '--platform', 'all', '--app', 'app.apk'],
  ])
    assert.throws(() => parseNativeArguments(args));
  assert.equal(phoneDisplay('08030000001'), '0803 000 0001');
  assert.throws(() => phoneDisplay('not-a-phone'));
});

test('prewarming uses Expo virtual entry with platform-specific source-map options', () => {
  const android = new URL(bundleUrl('android', 8082, 'com.lawaloy.stead'));
  const ios = new URL(bundleUrl('ios', 8082, 'com.lawaloy.stead'));
  assert.equal(android.pathname, '/.expo/.virtual-metro-entry.bundle');
  assert.equal(android.port, '8082');
  assert.equal(android.searchParams.get('platform'), 'android');
  assert.equal(android.searchParams.get('inlineSourceMap'), null);
  assert.equal(ios.searchParams.get('inlineSourceMap'), 'false');
});

test('device selection rejects offline and ambiguous Android targets', () => {
  assert.equal(
    selectAndroidDevice(
      'List of devices attached\nemulator-5554 device product:sdk',
    ),
    'emulator-5554',
  );
  assert.throws(() => selectAndroidDevice('emulator-5554 offline'));
  assert.throws(() =>
    selectAndroidDevice('emulator-5554 device\nemulator-5556 device'),
  );
  assert.equal(
    selectAndroidDevice(
      'emulator-5554 device\nemulator-5556 device',
      'emulator-5556',
    ),
    'emulator-5556',
  );
  assert.throws(() => selectAndroidDevice('emulator-5554 device', 'missing'));
});

test('iOS selection excludes unavailable devices and honors an explicit simulator', () => {
  const listing = {
    devices: {
      [TOOLCHAIN.IOS_RUNTIME]: [
        { name: 'Stead Native iPhone 17', udid: 'offline', isAvailable: false },
        {
          name: 'Stead Native iPhone 17',
          udid: 'ready',
          isAvailable: true,
          state: 'Booted',
        },
        {
          name: 'iPhone 17',
          udid: 'personal',
          isAvailable: true,
          state: 'Booted',
        },
      ],
    },
  };
  assert.equal(selectIosDevice(listing).udid, 'ready');
  assert.throws(() => selectIosDevice(listing, 'offline'));
  assert.throws(
    () => selectIosDevice(listing, 'personal'),
    /personal simulators are refused/,
  );
});

test('iOS cannot report successful preflight on Windows or Linux', async () => {
  let executions = 0;
  for (const host of ['win32', 'linux'])
    await assert.rejects(
      checkNativeToolchain('ios', {
        host,
        execute: async () => {
          executions += 1;
        },
      }),
      /requires macOS/,
    );
  assert.equal(executions, 0);
});
