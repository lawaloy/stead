import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOLCHAIN, checkJsToolchain } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';

export const checkDependencies = async ({ execute = runCommand } = {}) => {
  await checkJsToolchain({ execute });
  const mobile = join(ROOT, 'mobile');
  const env = { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' };
  for (const [cwd, flags] of [
    [ROOT, []],
    [join(ROOT, 'api'), ['--omit=dev']],
  ])
    await execute('npm', ['audit', ...flags, '--audit-level=high'], {
      cwd,
      env,
    });
  for (const args of [
    ['--omit-dev', '--audit-level=high'],
    ['--audit-level=moderate'],
  ])
    await execute(
      process.execPath,
      [join(ROOT, '.github/scripts/audit-npm.mjs'), ...args],
      { cwd: mobile, env },
    );
};

export const checkMobileCompatibility = async ({
  execute = runCommand,
} = {}) => {
  await checkJsToolchain({ execute });
  const mobile = join(ROOT, 'mobile');
  const env = { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' };
  await execute(
    process.execPath,
    [join(mobile, 'node_modules/expo/bin/cli'), 'install', '--check'],
    { cwd: mobile, env },
  );
  await execute(
    'npm',
    [
      'exec',
      '--yes',
      `--package=expo-doctor@${TOOLCHAIN.EXPO_DOCTOR_VERSION}`,
      '--',
      'expo-doctor',
    ],
    { cwd: mobile, env },
  );
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  (process.argv[2] === 'mobile-compatibility'
    ? checkMobileCompatibility()
    : checkDependencies()
  ).catch((error) => {
    console.error(`Dependency checks failed: ${error.message}`);
    process.exitCode = 1;
  });
