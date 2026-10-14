import { readFileSync, chmodSync } from 'node:fs';
import { matchesGlob, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, parsePort, parseNativeArguments } from './native-config.mjs';
import { runCommand } from './process-utils.mjs';

export const nativePolicy = () => {
  const source = readFileSync(
    join(ROOT, '.github/native-ci-paths.yml'),
    'utf8',
  );
  const paths = [...source.matchAll(/^\s+- '([^']+)'$/gm)].map(
    (match) => match[1],
  );
  if (!paths.length)
    throw new Error('The shared native path policy could not be read.');
  return paths;
};

export const requiresNative = (paths, policy = nativePolicy()) =>
  paths.some(
    (path) =>
      policy.some(
        (pattern) => !pattern.startsWith('!') && matchesGlob(path, pattern),
      ) &&
      !policy.some(
        (pattern) =>
          pattern.startsWith('!') && matchesGlob(path, pattern.slice(1)),
      ),
  );

export const parsePushRefs = (input) =>
  input
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const fields = line.trim().split(/\s+/);
      if (
        fields.length !== 4 ||
        !/^[a-f0-9]{40}$/.test(fields[1]) ||
        !/^[a-f0-9]{40}$/.test(fields[3])
      )
        throw new Error('Invalid Git pre-push ref input.');
      return {
        localRef: fields[0],
        localSha: fields[1],
        remoteRef: fields[2],
        remoteSha: fields[3],
      };
    });

const git = (args, options = {}) =>
  runCommand('git', args, {
    cwd: ROOT,
    quiet: true,
    stdoutOnly: true,
    ...options,
  });
const setting = async (name, fallback) => {
  try {
    return (await git(['config', '--get', name])).trim() || fallback;
  } catch {
    return fallback;
  }
};

export const installHook = async (args) => {
  let platform = 'all',
    port = 3000,
    repeat = 1;
  while (args.length) {
    const name = args.shift(),
      value = args.shift();
    if (name === '--platform' && ['android', 'ios', 'all'].includes(value))
      platform = value;
    else if (name === '--api-port') port = parsePort(value);
    else if (name === '--repeat') repeat = value;
    else
      throw new Error(
        'Use hooks:install -- --platform android|ios|all --api-port 3000 --repeat 1.',
      );
  }
  repeat = parseNativeArguments([
    'verify',
    '--platform',
    platform,
    '--api-port',
    String(port),
    '--repeat',
    String(repeat),
  ]).repeat;
  const existing = await setting('core.hooksPath', '');
  if (existing && existing !== '.githooks')
    throw new Error(
      `An existing hooks path is configured (${existing}). Chain this gate into your current pre-push hook instead of overwriting it.`,
    );
  if (process.platform !== 'win32')
    chmodSync(join(ROOT, '.githooks/pre-push'), 0o755);
  await git(['config', '--local', 'core.hooksPath', '.githooks']);
  await git(['config', '--local', 'stead.nativePlatforms', platform]);
  await git(['config', '--local', 'stead.nativeApiPort', String(port)]);
  await git(['config', '--local', 'stead.nativeRepeat', String(repeat)]);
  const toolSettings = {
    npmCli: process.env.STEAD_NPM_CLI || process.env.npm_execpath,
    javaHome: process.env.JAVA_HOME,
    androidHome: process.env.ANDROID_HOME,
    maestroBin: process.env.STEAD_MAESTRO_BIN,
    codeqlBin: process.env.STEAD_CODEQL_BIN,
  };
  for (const [name, value] of Object.entries(toolSettings))
    if (value) await git(['config', '--local', `stead.${name}`, value]);
  console.log(
    `Installed pre-push verification: native platform=${platform}, API port=${port}, attempts=${repeat}. ${platform === 'all' ? 'Both native platforms are required.' : 'The other platform still requires separate verification.'}`,
  );
};

export const verifyPush = async (
  input,
  { executeGit = git, execute = runCommand } = {},
) => {
  const git = executeGit;
  const setting = async (name, fallback) => {
    try {
      return (await git(['config', '--get', name])).trim() || fallback;
    } catch {
      return fallback;
    }
  };
  const refs = parsePushRefs(input).filter((ref) => !/^0+$/.test(ref.localSha));
  if (!refs.length) return;
  if ((await git(['status', '--porcelain'])).trim())
    throw new Error(
      'Commit or stash working-tree changes before pre-push verification; the gate must test the exact content being pushed.',
    );
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  if (refs.some((ref) => ref.localSha !== head))
    throw new Error(
      'Check out the branch being pushed so local validation tests its exact content.',
    );
  const paths = [];
  for (const ref of refs) {
    const branchBase = (
      await git(['merge-base', 'origin/main', ref.localSha])
    ).trim();
    const bases = new Set([
      branchBase,
      ...(/^0+$/.test(ref.remoteSha) ? [] : [ref.remoteSha]),
    ]);
    for (const base of bases)
      paths.push(
        ...(await git(['diff', '--name-only', '-z', base, ref.localSha]))
          .split('\0')
          .filter(Boolean),
      );
  }
  const port = parsePort(await setting('stead.nativeApiPort', '3000'));
  const env = { ...process.env };
  for (const [name, variable] of Object.entries({
    npmCli: 'STEAD_NPM_CLI',
    javaHome: 'JAVA_HOME',
    androidHome: 'ANDROID_HOME',
    maestroBin: 'STEAD_MAESTRO_BIN',
    codeqlBin: 'STEAD_CODEQL_BIN',
  })) {
    const value = await setting(`stead.${name}`, '');
    if (value) env[variable] = value;
  }
  if (requiresNative(paths)) {
    const platform = await setting('stead.nativePlatforms', 'all');
    const repeat = parseNativeArguments([
      'verify',
      '--platform',
      platform,
      '--api-port',
      String(port),
      '--repeat',
      await setting('stead.nativeRepeat', '1'),
    ]).repeat;
    await execute(
      'npm',
      [
        'run',
        'verify:local',
        '--',
        '--platform',
        platform,
        '--api-port',
        String(port),
        '--repeat',
        String(repeat),
      ],
      { cwd: ROOT, env },
    );
  } else {
    await execute('npm', ['run', 'dependencies:check'], { cwd: ROOT, env });
    await execute('npm', ['run', 'verify:full'], {
      cwd: ROOT,
      env: { ...env, STEAD_TEST_API_PORT: String(port) },
    });
    await execute('npm', ['run', 'security:codeql:local'], {
      cwd: ROOT,
      env,
    });
  }
  if (
    (await git(['status', '--porcelain'])).trim() ||
    (await git(['rev-parse', 'HEAD'])).trim() !== head
  )
    throw new Error(
      'The checkout changed during verification. Review and commit changes, then run the gate again before pushing.',
    );
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const main = async () => {
    if (process.argv[2] === 'install')
      return installHook(process.argv.slice(3));
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    return verifyPush(input);
  };
  main().catch((error) => {
    console.error(`Pre-push verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
