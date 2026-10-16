import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  cpSync,
  chmodSync,
  appendFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOLCHAIN, assertToolVersion } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';

export const verifyMaestroArchive = async (
  archive,
  expected = TOOLCHAIN.MAESTRO_SHA256,
) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== expected)
    throw new Error(
      'Maestro archive checksum mismatch. Nothing was installed.',
    );
};

export const installMaestro = async ({
  directory = join(ROOT, '.tmp/tools/maestro', TOOLCHAIN.MAESTRO_VERSION),
  archive,
} = {}) => {
  directory = resolve(directory);
  const bin = join(directory, 'bin');
  const executable = join(
    bin,
    process.platform === 'win32' ? 'maestro.bat' : 'maestro',
  );
  const checkVersion = async () => {
    const output = await runCommand(executable, ['--version'], { quiet: true });
    assertToolVersion(
      'Maestro',
      output.trim().split(/\r?\n/).at(-1),
      TOOLCHAIN.MAESTRO_VERSION,
    );
  };
  if (existsSync(directory)) {
    if (!existsSync(executable))
      throw new Error(
        `Refusing to replace existing directory ${directory}. Choose an empty installation directory.`,
      );
    await checkVersion();
  } else {
    const temporary = mkdtempSync(join(tmpdir(), 'stead-maestro-'));
    try {
      if (!archive) {
        archive = join(temporary, 'maestro.zip');
        const response = await fetch(
          `https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${TOOLCHAIN.MAESTRO_VERSION}/maestro.zip`,
        );
        if (!response.ok)
          throw new Error(`Maestro download failed: HTTP ${response.status}.`);
        await pipeline(
          Readable.fromWeb(response.body),
          createWriteStream(archive),
        );
      }
      archive = resolve(archive);
      await verifyMaestroArchive(archive);
      const unpacked = join(temporary, 'unpacked');
      if (process.platform === 'win32') {
        const script = join(temporary, 'extract.ps1');
        writeFileSync(
          script,
          'param([string]$Archive, [string]$Destination)\n$ErrorActionPreference = "Stop"\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination\n',
        );
        await runCommand('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          script,
          '-Archive',
          archive,
          '-Destination',
          unpacked,
        ]);
      } else {
        await runCommand('unzip', ['-q', archive, '-d', unpacked]);
      }
      mkdirSync(directory, { recursive: true });
      cpSync(join(unpacked, 'maestro'), directory, { recursive: true });
      if (process.platform !== 'win32') chmodSync(executable, 0o755);
      await checkVersion();
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  if (process.env.GITHUB_PATH)
    appendFileSync(process.env.GITHUB_PATH, `${bin}\n`);
  console.log(`Maestro ${TOOLCHAIN.MAESTRO_VERSION}: ${executable}`);
  return executable;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const options = {},
    args = process.argv.slice(2);
  while (args.length) {
    const name = args.shift(),
      value = args.shift();
    if (!['--directory', '--archive'].includes(name) || !value)
      throw new Error(
        'Use --directory <empty path> and optionally --archive <verified release zip>.',
      );
    options[name.slice(2)] = value;
  }
  installMaestro(options).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
