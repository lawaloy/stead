import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOLCHAIN, checkJsToolchain } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';

export const checkDependencies = async ({ execute = runCommand } = {}) => {
  await checkJsToolchain({ execute });
  const api = join(ROOT, 'api');
  const mobile = join(ROOT, 'mobile');
  const env = { ...process.env, CI: '1', EXPO_NO_DOTENV: '1' };
  await execute('npm', ['audit', '--audit-level=high'], { cwd: ROOT, env });
  const auditScript = join(ROOT, '.github/scripts/audit-npm.mjs');
  for (const cwd of [api, mobile]) {
    await execute(
      process.execPath,
      [auditScript, '--omit-dev', '--audit-level=high'],
      { cwd, env },
    );
    await execute(
      process.execPath,
      [auditScript, '--audit-level=moderate', '--report-only'],
      { cwd, env },
    );
  }
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
