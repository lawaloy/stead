import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOOLCHAIN } from './toolchain.mjs';
import {
  sdkLock,
  sdkReceipt,
  packageMetadata,
  installAndroidSdk,
  validateSdkModel,
} from './android-sdk.mjs';
import { verifyArchive, moveExtractedPackage } from './archive-utils.mjs';
import {
  assertAndroidUiHealthy,
  assertAndroidHostMemory,
  waitForAndroidHostMemory,
  managedAndroidWorkflow,
} from './android-emulator.mjs';
import { checkXcodeVersion, prepareIos } from './ios-setup.mjs';

test('Android startup waits for reclaimed memory but never lowers its allocation requirement', async () => {
  const requiredMiB = Number(TOOLCHAIN.ANDROID_EMULATOR_MEMORY) + 1024;
  let readings = 0;
  const result = await waitForAndroidHostMemory(
    () => (++readings === 1 ? requiredMiB - 1 : requiredMiB) * 1024 ** 2,
    50,
  );
  assert.equal(readings, 2);
  assert.deepEqual(result, { availableMiB: requiredMiB, requiredMiB });
  await assert.rejects(
    waitForAndroidHostMemory(() => (requiredMiB - 1) * 1024 ** 2, 20),
    /Insufficient host memory/,
  );
  const failure = new Error('Host resource inspection failed');
  await assert.rejects(
    waitForAndroidHostMemory(() => {
      throw failure;
    }),
    (error) => error === failure,
  );
});

test('SDK archive lock agrees with every shared SDK version and uses immutable URLs and hashes', () => {
  const { lock } = sdkLock();
  const expected = {
    'platform-tools': TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION,
    emulator: TOOLCHAIN.ANDROID_EMULATOR_VERSION,
    [`platforms;android-${TOOLCHAIN.ANDROID_COMPILE_SDK}`]:
      TOOLCHAIN.ANDROID_PLATFORM_REVISION,
    [`platforms;android-${TOOLCHAIN.ANDROID_API_LEVEL}`]:
      TOOLCHAIN.ANDROID_TEST_PLATFORM_REVISION,
    [`cmdline-tools;${TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION}`]:
      TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION,
    [`build-tools;${TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION}`]:
      TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION,
    [`build-tools;${TOOLCHAIN.ANDROID_MODULE_BUILD_TOOLS_VERSION}`]:
      TOOLCHAIN.ANDROID_MODULE_BUILD_TOOLS_VERSION,
    [`ndk;${TOOLCHAIN.ANDROID_NDK_VERSION}`]: TOOLCHAIN.ANDROID_NDK_VERSION,
    [`cmake;${TOOLCHAIN.ANDROID_CMAKE_VERSION}`]:
      TOOLCHAIN.ANDROID_CMAKE_VERSION,
    [`system-images;android-${TOOLCHAIN.ANDROID_API_LEVEL};${TOOLCHAIN.ANDROID_IMAGE_TARGET};${TOOLCHAIN.ANDROID_ARCH}`]:
      TOOLCHAIN.ANDROID_IMAGE_REVISION,
  };
  assert.equal(lock.packages.length, Object.keys(expected).length);
  for (const license of Object.values(lock.licenses)) {
    const text = license.xml
      .match(/<license[^>]*>([\s\S]*?)<\/license>/)[1]
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&');
    assert.equal(createHash('sha1').update(text).digest('hex'), license.sha1);
  }
  for (const pkg of lock.packages) {
    assert.equal(pkg.revision, expected[pkg.path]);
    assert.equal(
      pkg.namespaces.common,
      'http://schemas.android.com/repository/android/common/02',
    );
    const revision = pkg.metadata.match(/<revision>([\s\S]*?)<\/revision>/)[1];
    assert.deepEqual(
      [...revision.matchAll(/<(?:major|minor|micro)>(\d+)</g)].map((match) =>
        Number(match[1]),
      ),
      pkg.revision.split('.').map(Number),
    );
    assert.ok(pkg.metadata.includes(`ref="${lock.licenses[pkg.license].id}"`));
    assert.ok(!pkg.metadata.includes('channelRef'));
    for (const archive of Object.values(pkg.archives)) {
      assert.match(
        archive.url,
        /^https:\/\/dl\.google\.com\/android\/repository\//,
      );
      assert.match(archive.sha256, /^[a-f0-9]{64}$/);
      assert.ok(archive.size > 0);
      if (pkg.path === 'emulator')
        assert.ok(archive.url.includes(TOOLCHAIN.ANDROID_EMULATOR_BUILD));
    }
  }
});
test('corrupt archives and damaged SDK cache metadata cannot be used as an installation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stead sdk integrity '));
  try {
    const archive = join(dir, 'bad.zip');
    writeFileSync(archive, 'bad');
    await assert.rejects(verifyArchive(archive, '0'.repeat(64)), /mismatch/);
    await assert.rejects(
      installAndroidSdk({ directory: dir, acceptLicenses: true }),
      /ENOENT/,
    );
    const { lock, digest } = sdkLock();
    writeFileSync(
      join(dir, '.stead-sdk.json'),
      JSON.stringify({ digest, platform: process.platform }),
    );
    for (const pkg of lock.packages) {
      const target = join(dir, ...pkg.path.split(';'));
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, 'source.properties'), 'fixture');
      writeFileSync(join(target, 'package.xml'), packageMetadata(lock, pkg));
    }
    assert.equal(sdkReceipt(dir).digest, digest);
    const file = join(dir, ...lock.packages[0].path.split(';'), 'package.xml');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('<major>', '<major>9'),
    );
    assert.throws(() => sdkReceipt(dir), /missing or changed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('system UI crashes fail preflight instead of masquerading as login failures', () => {
  assert.throws(
    () =>
      assertAndroidUiHealthy(
        'mCurrentFocus=Window{abc Application Error: com.android.systemui}',
      ),
    /system dialog/,
  );
  assert.equal(assertAndroidUiHealthy('mCurrentFocus=null'), false);
  assert.equal(
    assertAndroidUiHealthy('mCurrentFocus=Window{abc com.android.launcher3}'),
    true,
  );
});
test('managed verification finishes preparation before boot and preserves source evidence and cleanup', async () => {
  const before = process.env;
  const events = [];
  await assert.rejects(
    managedAndroidWorkflow(
      { command: 'verify', repeat: 3 },
      {
        environment: {},
        checkHostResources: () => {},
        workflow: async (options) => {
          if (options.prepareOnly) {
            events.push('prepare');
            assert.equal(options.device, undefined);
            return {
              app: '/fresh.apk',
              sourceBuilt: true,
              metadata: { sdkArchiveLock: 'fixture' },
            };
          }
          events.push('journey');
          assert.equal(options.command, 'test');
          assert.equal(options.sourceBuilt, true);
          assert.equal(options.repeat, 3);
          assert.equal(options.device, 'emulator-5554');
          assert.equal(options.buildMetadata.sdkArchiveLock, 'fixture');
          throw new Error('original journey failure');
        },
        emulator: async (operation) => {
          events.push('boot');
          try {
            return await operation({ env: {}, device: 'emulator-5554' });
          } finally {
            events.push('stop');
          }
        },
      },
    ),
    /original journey failure/,
  );
  assert.deepEqual(events, ['prepare', 'boot', 'journey', 'stop']);
  assert.equal(process.env, before);
  let booted = false;
  await assert.rejects(
    managedAndroidWorkflow(
      { command: 'verify' },
      {
        environment: {},
        checkHostResources: () => {},
        workflow: async () => {
          throw new Error('build failed');
        },
        emulator: async () => {
          booted = true;
        },
      },
    ),
    /build failed/,
  );
  assert.equal(booted, false);
  assert.equal(process.env, before);
});
test('memory-starved native verification fails before checks, builds or emulator allocation', async () => {
  const required = Number(TOOLCHAIN.ANDROID_EMULATOR_MEMORY) + 1024;
  assert.deepEqual(assertAndroidHostMemory(required * 1024 ** 2), {
    availableMiB: required,
    requiredMiB: required,
  });
  assert.throws(
    () => assertAndroidHostMemory((required - 1) * 1024 ** 2),
    /Insufficient host memory.*No emulator was started/,
  );
  const before = process.env;
  let worked = false;
  await assert.rejects(
    managedAndroidWorkflow(
      { command: 'verify' },
      {
        environment: {},
        checkHostResources: () => assertAndroidHostMemory(512 * 1024 ** 2),
        workflow: async () => {
          worked = true;
        },
        emulator: async () => {
          worked = true;
        },
      },
    ),
    /Insufficient host memory/,
  );
  assert.equal(worked, false);
  assert.equal(process.env, before);
});
test('transient extraction locks are bounded and other filesystem errors are not retried', async () => {
  let calls = 0;
  await moveExtractedPackage(
    '/from',
    '/to',
    async () => {
      if (++calls < 3)
        throw Object.assign(new Error('scan lock'), { code: 'EPERM' });
    },
    async () => {},
  );
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    moveExtractedPackage(
      '/from',
      '/to',
      async () => {
        calls++;
        throw Object.assign(new Error('locked'), { code: 'EBUSY' });
      },
      async () => {},
    ),
    /locked/,
  );
  assert.equal(calls, 11);
  calls = 0;
  await assert.rejects(
    moveExtractedPackage(
      '/from',
      '/to',
      async () => {
        calls++;
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      },
      async () => {},
    ),
    /disk full/,
  );
  assert.equal(calls, 1);
});
test('SDK model recognizes both CLI table formats and rejects a different image revision', async () => {
  const { lock } = sdkLock();
  for (const format of ['columns', 'pipes', 'colored']) {
    const output = lock.packages
      .map((pkg) =>
        format === 'pipes'
          ? ` ${pkg.path} | ${pkg.revision} | description | location`
          : `  ${pkg.path.replaceAll(';', '/').padEnd(50)} ${pkg.revision.padEnd(18)} description`,
      )
      .map((line) =>
        format === 'colored' ? `\u001b[32m${line}\u001b[39m\u001b[0m` : line,
      )
      .join('\r\n');
    await validateSdkModel('/fixture', async () => output);
    await assert.rejects(
      validateSdkModel(
        '/fixture',
        async () => `${output}\nextra-package | 1 | outside lock`,
      ),
      /Unexpected SDK package/,
    );
    const image = lock.packages.find((pkg) =>
      pkg.path.startsWith('system-images;'),
    );
    const changed = output.replace(
      format === 'pipes'
        ? `${image.path} | ${image.revision}`
        : `${image.path.replaceAll(';', '/').padEnd(50)} ${image.revision.padEnd(18)}`,
      `${image.path} | 2`,
    );
    await assert.rejects(
      validateSdkModel('/fixture', async () => changed),
      /did not recognize locked package system-images/,
    );
  }
  await assert.rejects(
    validateSdkModel('/fixture', async () => 'Warning: package.xml is corrupt'),
    /could not be parsed/,
  );
});
test('Xcode release and build are checked separately from simulator runtime', async () => {
  checkXcodeVersion(
    `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`,
  );
  assert.throws(
    () =>
      checkXcodeVersion(
        `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version wrong`,
      ),
    /Xcode build/,
  );
  await assert.rejects(prepareIos({ host: 'win32' }), /requires a Mac/);
  const env = await prepareIos({
    host: 'darwin',
    env: { MAESTRO_DRIVER_STARTUP_TIMEOUT: '1' },
    exists: () => true,
    execute: async (command, args, options) => {
      assert.equal(
        options.env.MAESTRO_DRIVER_STARTUP_TIMEOUT,
        TOOLCHAIN.IOS_DRIVER_STARTUP_TIMEOUT_MS,
      );
      if (command === 'xcodebuild')
        return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
      if (args.includes('runtimes'))
        return JSON.stringify({
          runtimes: [{ identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: true }],
        });
      if (args.includes('devices'))
        return JSON.stringify({
          devices: {
            [TOOLCHAIN.IOS_RUNTIME]: [
              { isAvailable: true, name: 'Stead Native iPhone 17' },
            ],
          },
        });
      throw Error('Unexpected simulator mutation');
    },
  });
  assert.ok(env.DEVELOPER_DIR.includes(TOOLCHAIN.XCODE_VERSION));
  assert.equal(env.MAESTRO_DRIVER_STARTUP_TIMEOUT, '240000');
});
