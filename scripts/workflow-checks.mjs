import { ROOT, TOOLCHAIN, assertToolVersion } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';
import { join } from 'node:path';

await runCommand(
  process.execPath,
  [join(ROOT, '.github/scripts/validate-workflow-contracts.mjs')],
  { cwd: ROOT },
);
const image = TOOLCHAIN.WORKFLOW_CHECK_IMAGE;
// Pulling is the only network step; workflow analysis has no network or write access.
try {
  await runCommand('docker', ['image', 'inspect', image], { quiet: true });
} catch {
  await runCommand('docker', ['pull', image], { cwd: ROOT });
}
const version = await runCommand(
  'docker',
  ['run', '--rm', '--network', 'none', image, '-version'],
  { quiet: true },
);
assertToolVersion(
  'actionlint',
  version.trim().split(/\r?\n/)[0],
  TOOLCHAIN.ACTIONLINT_VERSION,
);
const shellcheck = await runCommand(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'none',
    '--entrypoint',
    'shellcheck',
    image,
    '--version',
  ],
  { quiet: true },
);
assertToolVersion(
  'ShellCheck',
  shellcheck.match(/version: ([\d.]+)/)?.[1],
  TOOLCHAIN.SHELLCHECK_VERSION,
);
await runCommand(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--mount',
    `type=bind,source=${ROOT},target=/work,readonly`,
    '--workdir',
    '/work',
    image,
  ],
  { cwd: ROOT },
);
