import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT, TOOLCHAIN } from './toolchain.mjs';
import { runCommand, withCleanup } from './process-utils.mjs';

export const waitForBuildExit = async (pid, timeout = 30_000) => {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid)
    throw new Error('Invalid Gradle build JVM process identifier.');
  const deadline = Date.now() + timeout;
  while (true) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    if (Date.now() >= deadline)
      throw new Error(
        'Gradle build JVM has not exited. Android startup is blocked until build cleanup completes.',
      );
    await delay(100);
  }
};

export const buildAndroidGradle = async ({ directory, env, signal }) => {
  mkdirSync(join(ROOT, '.tmp'), { recursive: true });
  const state = mkdtempSync(join(ROOT, '.tmp/native-gradle-'));
  const pidFile = join(state, 'build.pid');
  const init = join(state, 'record-process.gradle');
  writeFileSync(
    init,
    "new File(System.getProperty('stead.native.build.pidFile')).text = java.lang.ProcessHandle.current().pid().toString()\n",
  );
  await withCleanup(
    () =>
      runCommand(
        join(
          directory,
          process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
        ),
        [
          'app:assembleDebug',
          '--no-daemon',
          '--max-workers=2',
          '-Pkotlin.compiler.execution.strategy=in-process',
          '-Pandroid.builder.sdkDownload=false',
          `-PreactNativeArchitectures=${TOOLCHAIN.ANDROID_ARCH}`,
          '--init-script',
          init,
          `-Dstead.native.build.pidFile=${pidFile}`,
        ],
        {
          cwd: directory,
          env: {
            ...env,
            'ORG_GRADLE_PROJECT_kotlin.compiler.execution.strategy':
              'in-process',
          },
          signal,
        },
      ),
    [
      async () => {
        if (existsSync(pidFile)) {
          await waitForBuildExit(Number(readFileSync(pidFile, 'utf8').trim()));
          console.log('Gradle build JVM exited before Android startup.');
        }
      },
    ],
  );
  if (!existsSync(pidFile))
    throw new Error('Gradle did not record its build JVM; startup is blocked.');
};
