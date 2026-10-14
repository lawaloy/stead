import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './process-utils.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TOOLCHAIN = Object.fromEntries(
  readFileSync(join(ROOT, '.github/ci.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => line.split('=')),
);

export const assertToolVersion = (name, actual, expected) => {
  if (actual !== expected)
    throw new Error(
      `Use ${name} ${expected} to match CI (found ${actual || 'no version'}). Versions are defined in .github/ci.env.`,
    );
};

export const checkJsToolchain = async ({
  execute = runCommand,
  env = process.env,
  node = process.versions.node,
} = {}) => {
  assertToolVersion('Node', node, TOOLCHAIN.NODE_VERSION);
  const npm = (
    await execute('npm', ['--version'], { quiet: true, env })
  ).trim();
  assertToolVersion('npm', npm, TOOLCHAIN.NPM_VERSION);
  return { node, npm };
};

export const checkPostgresVersion = async (pool) => {
  const { rows } = await pool.query('SHOW server_version');
  const version = rows[0].server_version.split(' ')[0];
  assertToolVersion('PostgreSQL', version, TOOLCHAIN.POSTGRES_VERSION);
  return version;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  checkJsToolchain()
    .then((metadata) => console.log(JSON.stringify(metadata)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
