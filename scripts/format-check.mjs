import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';

export const checkSourceFormatting = async (
  root = ROOT,
  execute = runCommand,
) => {
  const files = [
    ...new Set(
      (
        await execute(
          'git',
          ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
          { cwd: root, quiet: true, stdoutOnly: true },
        )
      ).split('\0'),
    ),
  ].filter((file) => file && existsSync(join(root, file)));
  let batch = [],
    length = 0;
  const check = async () => {
    if (!batch.length) return;
    await execute(
      process.execPath,
      [
        join(ROOT, 'node_modules/prettier/bin/prettier.cjs'),
        '--check',
        '--ignore-unknown',
        ...batch,
      ],
      { cwd: root },
    );
    batch = [];
    length = 0;
  };
  for (const file of files) {
    // Stay below Windows' command-line limit without shell expansion.
    if (length + file.length + 3 > 16_000) await check();
    batch.push(`./${file}`);
    length += file.length + 3;
  }
  await check();
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  checkSourceFormatting().catch((error) => {
    console.error(`Source formatting failed: ${error.message}`);
    process.exitCode = 1;
  });
