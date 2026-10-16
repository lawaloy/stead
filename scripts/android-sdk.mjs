import { createHash } from 'node:crypto';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  renameSync,
  appendFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { ROOT, TOOLCHAIN } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';
import {
  verifyArchive,
  downloadArchive,
  extractZip,
  moveExtractedPackage,
} from './archive-utils.mjs';

export const sdkLock = () => {
  const source = readFileSync(join(ROOT, '.github/android-sdk-lock.json'));
  return {
    lock: JSON.parse(source),
    digest: createHash('sha256').update(source).digest('hex'),
  };
};
export const repositorySdk = (platform = process.platform) =>
  join(
    ROOT,
    '.tmp',
    'android-sdk',
    `${sdkLock().digest.slice(0, 16)}-${platform}-x64`,
  );

export const sdkReceipt = (directory, digest = sdkLock().digest) => {
  const receipt = JSON.parse(
    readFileSync(join(directory, '.stead-sdk.json'), 'utf8'),
  );
  if (receipt.digest !== digest || receipt.platform !== process.platform)
    throw new Error(
      'Android SDK receipt does not match the committed archive lock. Reinstall the dedicated SDK.',
    );
  const { lock } = sdkLock();
  for (const pkg of lock.packages) {
    const target = join(directory, ...pkg.path.split(';'));
    if (
      !existsSync(join(target, 'source.properties')) ||
      readFileSync(join(target, 'package.xml'), 'utf8') !==
        packageMetadata(lock, pkg)
    )
      throw new Error(
        `Locked SDK package is missing or changed: ${pkg.path}. Reinstall the dedicated SDK.`,
      );
  }
  return receipt;
};

export const packageMetadata = (lock, pkg) => {
  const namespaces = Object.entries(pkg.namespaces)
    .map(([name, uri]) => `xmlns:${name}="${uri}"`)
    .join(' ');
  return `<?xml version="1.0"?><common:repository ${namespaces}>${lock.licenses[pkg.license].xml}${pkg.metadata}</common:repository>`;
};

export const validateSdkModel = async (
  directory,
  execute = runCommand,
  env = process.env,
) => {
  const manager = join(
    directory,
    'cmdline-tools',
    TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION,
    'bin',
    process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager',
  );
  const output = stripVTControlCharacters(
    await execute(manager, ['--sdk_root=' + directory, '--list_installed'], {
      env,
      quiet: true,
    }),
  );
  if (/Warning:.*(?:package\.xml|corrupt|Undefined ID)/i.test(output))
    throw new Error(`Android SDK metadata could not be parsed: ${output}`);
  const rows = new Map(
    output
      .split(/\r?\n/)
      .map((line) =>
        line.includes('|')
          ? line.split('|').map((value) => value.trim())
          : line.match(/^\s*([\w./;-]+)\s+(\d+(?:\.\d+)*)\s+/)?.slice(1),
      )
      .filter(Boolean)
      .filter(([, revision]) => /^\d+(?:\.\d+)*$/.test(revision))
      .map(([path, revision]) => [path.replaceAll('/', ';'), revision]),
  );
  for (const pkg of sdkLock().lock.packages)
    if (
      rows.get(pkg.path)?.replace(/(\.0)+$/, '') !==
      pkg.revision.replace(/(\.0)+$/, '')
    )
      throw new Error(
        `SDK manager did not recognize locked package ${pkg.path} ${pkg.revision}.\n${output}`,
      );
  const expected = new Set(sdkLock().lock.packages.map(({ path }) => path));
  for (const path of rows.keys())
    if (!expected.has(path))
      throw new Error(
        `Unexpected SDK package outside the archive lock: ${path}. Reinstall the dedicated SDK.`,
      );
};

export const installAndroidSdk = async ({
  directory = repositorySdk(),
  cache = join(ROOT, '.tmp/sdk-archives'),
  acceptLicenses = false,
} = {}) => {
  if (
    process.arch !== 'x64' ||
    !['linux', 'win32', 'darwin'].includes(process.platform)
  )
    throw new Error(
      'The CI Android baseline requires an x86_64 host. Apple Silicon hosts can run the iOS gate.',
    );
  directory = resolve(directory);
  cache = resolve(cache);
  const { lock, digest } = sdkLock();
  if (existsSync(directory)) sdkReceipt(directory, digest);
  else {
    if (!acceptLicenses)
      throw new Error(
        'Review the Android SDK license, then use --accept-licenses for this dedicated installation.',
      );
    mkdirSync(dirname(directory), { recursive: true });
    mkdirSync(cache, { recursive: true });
    const staging = mkdtempSync(`${directory}.install-`);
    try {
      for (const pkg of lock.packages) {
        const archive = pkg.archives[process.platform] || pkg.archives.all;
        if (!archive)
          throw new Error(`No locked archive for ${pkg.path} on this host.`);
        const file = join(
          cache,
          new URL(archive.url).pathname.split('/').at(-1),
        );
        if (!existsSync(file)) {
          const partial = `${file}.partial`;
          try {
            await downloadArchive(archive.url, partial);
            await verifyArchive(partial, archive.sha256, archive.size);
            renameSync(partial, file);
          } finally {
            rmSync(partial, { force: true });
          }
        }
        await verifyArchive(file, archive.sha256, archive.size);
        const temporary = mkdtempSync(join(staging, '.extract-'));
        try {
          const unpacked = join(temporary, 'unpacked');
          await extractZip(file, unpacked);
          const target = join(staging, ...pkg.path.split(';'));
          mkdirSync(dirname(target), { recursive: true });
          await moveExtractedPackage(join(unpacked, archive.root), target);
          if (!existsSync(join(target, 'source.properties')))
            writeFileSync(
              join(target, 'source.properties'),
              `Pkg.Revision=${pkg.revision}\nPkg.Path=${pkg.path}\n`,
            );
          writeFileSync(
            join(target, 'package.xml'),
            packageMetadata(lock, pkg),
          );
          console.log(`Installed locked ${pkg.path} (${pkg.revision}).`);
        } finally {
          rmSync(temporary, { recursive: true, force: true, maxRetries: 10 });
        }
      }
      mkdirSync(join(staging, 'licenses'));
      const accepted = new Map();
      for (const license of Object.values(lock.licenses)) {
        const hashes = accepted.get(license.id) || new Set();
        hashes.add(license.sha1);
        accepted.set(license.id, hashes);
      }
      for (const [name, hashes] of accepted)
        writeFileSync(
          join(staging, 'licenses', name),
          `${[...hashes].join('\n')}\n`,
        );
      writeFileSync(
        join(staging, '.stead-sdk.json'),
        JSON.stringify(
          {
            digest,
            platform: process.platform,
            packages: lock.packages.map(({ path, revision }) => ({
              path,
              revision,
            })),
          },
          null,
          2,
        ),
      );
      // Publish only a complete SDK; failed provisioning cannot masquerade as a cache hit.
      await moveExtractedPackage(staging, directory);
    } finally {
      rmSync(staging, { recursive: true, force: true, maxRetries: 10 });
    }
  }
  if (process.env.GITHUB_ENV)
    appendFileSync(
      process.env.GITHUB_ENV,
      `ANDROID_HOME=${directory}\nANDROID_SDK_ROOT=${directory}\n`,
    );
  if (process.env.GITHUB_PATH)
    for (const path of [
      'platform-tools',
      'emulator',
      `cmdline-tools/${TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION}/bin`,
    ])
      appendFileSync(process.env.GITHUB_PATH, `${join(directory, path)}\n`);
  console.log(`Dedicated locked Android SDK: ${directory}`);
  return directory;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const options = {};
  const args = process.argv.slice(2);
  while (args.length) {
    const flag = args.shift();
    if (flag === '--accept-licenses') options.acceptLicenses = true;
    else if (['--directory', '--cache'].includes(flag) && args[0])
      options[flag.slice(2)] = args.shift();
    else
      throw new Error(
        'Use --accept-licenses, optionally --directory <new path> and --cache <archive directory>.',
      );
  }
  installAndroidSdk(options).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
