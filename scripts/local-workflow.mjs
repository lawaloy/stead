import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { TOOLCHAIN } from './toolchain.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');
const API_DIR = join(ROOT, 'api');
const MOBILE_DIR = join(ROOT, 'mobile');
const COMPOSE_FILE = join(API_DIR, 'docker-compose.yml');

const DATABASE_BASE = 'postgresql://stead:stead@127.0.0.1:5432/stead';
const E2E_DATABASE_URL = `${DATABASE_BASE}?schema=e2e`;
const JOURNEY_DATABASE_URL = `${DATABASE_BASE}?schema=e2e_mobile`;
const JOURNEY_PORT = Number(process.env.STEAD_TEST_API_PORT || 3000);
if (
  !Number.isInteger(JOURNEY_PORT) ||
  JOURNEY_PORT < 1024 ||
  JOURNEY_PORT > 65535
) {
  throw new Error(
    'STEAD_TEST_API_PORT must be an integer between 1024 and 65535.',
  );
}
const JOURNEY_API_URL = `http://127.0.0.1:${JOURNEY_PORT}`;

export const testEnvironment = (
  databaseUrl,
  inheritedEnvironment = process.env,
  { port = 3000 } = {},
) => {
  const environment = {
    ...inheritedEnvironment,
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    NODE_ENV: 'test',
    JWT_SECRET: 'stead-local-test-jwt-secret',
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY:
      'stead-local-test-notification-key-1234567890',
    AUTH_DEVICE_IDENTIFIER_SECRET:
      'stead-local-test-device-identifier-key-1234567890',
    SMS_PROVIDER: 'dev',
    DEV_EXPOSE_OTP: 'true',
    LOG_FORMAT: 'json',
    LOG_LEVEL: 'info',
    AUTH_INSPECTION_OPERATOR_USER_IDS: '',
  };
  delete environment.E2E_DATABASE_URL;
  return environment;
};

const commandText = (command, args) => [command, ...args].join(' ');

const resolveSpawn = (command, args) => {
  if (command === 'npm' && process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
      shell: false,
    };
  }
  return {
    command,
    args,
    shell: process.platform === 'win32' && command === 'npm',
  };
};

const run = (
  command,
  args,
  {
    cwd = ROOT,
    env = process.env,
    stdio = 'inherit',
    allowFailure = false,
  } = {},
) =>
  new Promise((resolvePromise, reject) => {
    const resolved = resolveSpawn(command, args);
    const child = spawn(resolved.command, resolved.args, {
      cwd,
      env,
      stdio,
      shell: resolved.shell,
    });

    child.once('error', (error) => {
      if (allowFailure) {
        resolvePromise(false);
        return;
      }
      reject(
        new Error(
          `Could not start ${commandText(command, args)}: ${error.message}`,
        ),
      );
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise(true);
        return;
      }
      if (allowFailure) {
        resolvePromise(false);
        return;
      }
      reject(
        new Error(
          `${commandText(command, args)} failed${
            signal ? ` with signal ${signal}` : ` with exit code ${code}`
          }`,
        ),
      );
    });
  });

const makeSecret = () => randomBytes(32).toString('base64url');

export const renderApiEnvironment = (example, secretFactory = makeSecret) => {
  const secrets = Array.from({ length: 3 }, () => secretFactory());
  if (new Set(secrets).size !== secrets.length) {
    throw new Error('Generated local secrets must be distinct.');
  }

  let index = 0;
  const rendered = example.replaceAll('__REPLACE_ME__', () => secrets[index++]);
  if (index !== secrets.length || rendered.includes('__REPLACE_ME__')) {
    throw new Error(
      `Expected exactly ${secrets.length} replaceable API secrets in .env.example.`,
    );
  }
  return rendered;
};

const createFromExample = (
  examplePath,
  targetPath,
  transform = (value) => value,
  displayRoot = ROOT,
) => {
  const displayPath = relative(displayRoot, targetPath);
  if (existsSync(targetPath)) {
    console.log(`Kept existing ${displayPath}.`);
    return false;
  }

  const rendered = transform(readFileSync(examplePath, 'utf8'));
  writeFileSync(targetPath, rendered, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  console.log(`Created ${displayPath}.`);
  return true;
};

export const initializeLocalEnvironment = (
  root = ROOT,
  secretFactory = makeSecret,
) => {
  const apiDir = join(root, 'api');
  const mobileDir = join(root, 'mobile');
  return {
    apiCreated: createFromExample(
      join(apiDir, '.env.example'),
      join(apiDir, '.env'),
      (example) => renderApiEnvironment(example, secretFactory),
      root,
    ),
    mobileCreated: createFromExample(
      join(mobileDir, '.env.example'),
      join(mobileDir, '.env'),
      (value) => value,
      root,
    ),
  };
};

const compose = (args, options) =>
  run(
    'docker',
    [
      'compose',
      '--env-file',
      join(ROOT, '.github/ci.env'),
      '-f',
      COMPOSE_FILE,
      ...args,
    ],
    {
      ...options,
      env: {
        ...process.env,
        ...options?.env,
        POSTGRES_IMAGE: TOOLCHAIN.POSTGRES_IMAGE,
      },
    },
  );

const waitForDatabase = async () => {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const ready = await compose(
      ['exec', '-T', 'db', 'pg_isready', '-U', 'stead', '-d', 'stead'],
      { stdio: 'ignore', allowFailure: true },
    );
    if (ready) {
      console.log('PostgreSQL is ready.');
      return;
    }
    await delay(1_000);
  }
  throw new Error('PostgreSQL did not become ready within 30 seconds.');
};

const startDatabase = async () => {
  await compose(['up', '-d']);
  await waitForDatabase();
};

const migrate = (databaseUrl) =>
  run('npm', ['exec', '--', 'prisma', 'migrate', 'deploy'], {
    cwd: API_DIR,
    env: databaseUrl
      ? { ...process.env, DATABASE_URL: databaseUrl }
      : process.env,
  });

const prepareDevelopment = async () => {
  initializeLocalEnvironment();
  await startDatabase();
  await migrate();
  console.log('Local environment, database, and migrations are ready.');
};

const runE2E = async ({ databaseReady = false } = {}) => {
  if (!databaseReady) await startDatabase();
  const env = testEnvironment(E2E_DATABASE_URL);
  await migrate(E2E_DATABASE_URL);
  await run('npm', ['run', 'test:e2e', '--', '--runInBand'], {
    cwd: API_DIR,
    env,
  });
};

const endpointResponds = async (url) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
};

const waitForApi = async (child, output) => {
  const endpoint = `${JOURNEY_API_URL}/auth/countries`;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`The API exited before it became ready.\n${output()}`);
    }
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await delay(1_000);
  }
  throw new Error(
    `The API did not become ready within 30 seconds.\n${output()}`,
  );
};

export const assertStructuredRequestLog = (
  output,
  requestId,
  forbiddenValues = [],
) => {
  const records = output
    .split(/\r?\n/u)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const requestLog = records.find(
    (record) =>
      record.message === 'HTTP request completed' &&
      record.requestId === requestId,
  );
  if (!requestLog) {
    throw new Error(`No structured request log found for ${requestId}.`);
  }
  if (
    requestLog.path !== '/auth/countries' ||
    requestLog.method !== 'GET' ||
    requestLog.statusCode !== 200 ||
    typeof requestLog.durationMs !== 'number'
  ) {
    throw new Error('The structured request log is missing required fields.');
  }
  for (const value of forbiddenValues) {
    if (output.includes(value)) {
      throw new Error('A forbidden value was written to process logs.');
    }
  }
};

const verifyStructuredProcessLogging = async (output) => {
  const requestId = 'journey-log-contract';
  const querySecret = 'never-log-query-value';
  const authorizationSecret = 'never-log-authorization-value';
  const response = await fetch(
    `${JOURNEY_API_URL}/auth/countries?probe=${querySecret}`,
    {
      headers: {
        authorization: `Bearer ${authorizationSecret}`,
        'x-request-id': requestId,
      },
    },
  );
  if (!response.ok) {
    throw new Error('The structured logging probe request failed.');
  }
  await delay(50);
  assertStructuredRequestLog(output(), requestId, [
    querySecret,
    authorizationSecret,
  ]);
};

const stopChild = async (child) => {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolvePromise) => child.once('exit', resolvePromise)),
    delay(5_000),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const runJourney = async ({ databaseReady = false } = {}) => {
  const endpoint = `${JOURNEY_API_URL}/auth/countries`;
  if (await endpointResponds(endpoint)) {
    throw new Error(
      `Port ${JOURNEY_PORT} is already serving an application. Stop it or select another STEAD_TEST_API_PORT before running the isolated journey.`,
    );
  }

  if (!databaseReady) await startDatabase();
  const env = testEnvironment(JOURNEY_DATABASE_URL, process.env, {
    port: JOURNEY_PORT,
  });
  await migrate(JOURNEY_DATABASE_URL);
  await run('npm', ['run', 'build'], { cwd: API_DIR, env });

  const api = spawn(process.execPath, ['dist/src/main.js'], {
    cwd: API_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const collect = (chunk) => {
    logs = `${logs}${chunk}`.slice(-100_000);
  };
  api.stdout.on('data', collect);
  api.stderr.on('data', collect);

  const stopOnSignal = () => void stopChild(api);
  process.once('SIGINT', stopOnSignal);
  process.once('SIGTERM', stopOnSignal);

  try {
    await waitForApi(api, () => logs);
    await verifyStructuredProcessLogging(() => logs);
    await run('npm', ['run', 'test:live-api'], {
      cwd: MOBILE_DIR,
      env: { ...env, STEAD_TEST_API_URL: JOURNEY_API_URL },
    });
  } catch (error) {
    if (logs) console.error(logs);
    throw error;
  } finally {
    process.removeListener('SIGINT', stopOnSignal);
    process.removeListener('SIGTERM', stopOnSignal);
    await stopChild(api);
  }
};

const usage = () => {
  console.log(`Usage: node scripts/local-workflow.mjs <command>

Commands:
  env:init       Create missing local env files with distinct generated secrets
  db:start       Start PostgreSQL and wait until it accepts connections
  db:stop        Stop the local PostgreSQL container
  dev:prepare    Initialize env files, start PostgreSQL, and apply migrations
  test:e2e       Prepare the isolated e2e schema and run API e2e tests
  test:journey   Run the live mobile API-client journey against an isolated API

CI may append --database-ready when its PostgreSQL service is already healthy.`);
};

const main = async () => {
  const databaseReady = process.argv.includes('--database-ready');
  switch (process.argv[2]) {
    case 'env:init':
      initializeLocalEnvironment();
      break;
    case 'db:start':
      await startDatabase();
      break;
    case 'db:stop':
      await compose(['down']);
      break;
    case 'dev:prepare':
      await prepareDevelopment();
      break;
    case 'test:e2e':
      await runE2E({ databaseReady });
      break;
    case 'test:journey':
      await runJourney({ databaseReady });
      break;
    default:
      usage();
      process.exitCode = 1;
  }
};

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`Local workflow failed: ${error.message}`);
    process.exitCode = 1;
  });
}
