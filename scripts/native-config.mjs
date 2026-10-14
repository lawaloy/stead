import { randomBytes } from 'node:crypto';
import { testEnvironment } from './local-workflow.mjs';
export { ROOT, TOOLCHAIN } from './toolchain.mjs';

export const parsePort = (value) => {
  if (
    !/^\d+$/.test(String(value)) ||
    Number(value) < 1024 ||
    Number(value) > 65535
  )
    throw new Error('Test ports must be integers between 1024 and 65535.');
  return Number(value);
};

export const nativeDatabaseUrl = (base, schema) => {
  assertOwnedSchema(schema);
  const url = new URL(base);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(
      'Native verification requires a local PostgreSQL database.',
    );
  }
  if (url.pathname.length <= 1) throw new Error('A database name is required.');
  url.searchParams.set('schema', schema);
  return url.toString();
};

export const assertOwnedSchema = (schema) => {
  if (!/^e2e_native_[a-f0-9]{16}$/.test(schema))
    throw new Error(
      'Refusing to modify a schema not allocated by the native runner.',
    );
  return schema;
};

export const newSchema = () => `e2e_native_${randomBytes(8).toString('hex')}`;

export const nativeEnvironment = (
  { databaseUrl, apiPort, metroPort, phone },
  inherited = process.env,
) => ({
  ...testEnvironment(databaseUrl, inherited),
  PORT: String(apiPort),
  AUTH_INSPECTION_OPERATOR_USER_IDS: '',
  EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
  EXPO_PUBLIC_E2E_PHONE: phone,
  CI: '1',
  METRO_PORT: String(metroPort),
});

export const phoneDisplay = (phone) => {
  if (!/^0[789][01]\d{8}$/.test(phone))
    throw new Error('Use an 11-digit disposable Nigerian mobile test number.');
  return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
};

export const bundleUrl = (platform, port, appId) => {
  const url = new URL(
    `http://127.0.0.1:${port}/.expo/.virtual-metro-entry.bundle`,
  );
  const common = {
    platform,
    dev: 'true',
    lazy: 'true',
    minify: 'false',
    modulesOnly: 'false',
    runModule: 'true',
    excludeSource: 'true',
    sourcePaths: 'url-server',
    app: appId,
  };
  if (platform === 'ios') common.inlineSourceMap = 'false';
  Object.entries(common).forEach(([name, value]) =>
    url.searchParams.set(name, value),
  );
  return url.toString();
};

export const parseNativeArguments = (args) => {
  const command = args.shift() ?? 'doctor';
  if (!['doctor', 'build', 'test', 'verify'].includes(command))
    throw new Error('Expected doctor, build, test, or verify.');
  const options = {
    command,
    platform: command === 'verify' ? 'all' : 'android',
    repeat: 1,
    apiPort: 3000,
    metroPort: 8081,
    phone: '08030000001',
    databaseReady: false,
  };
  const names = new Set([
    'platform',
    'repeat',
    'api-port',
    'metro-port',
    'phone',
    'device',
    'app',
  ]);
  while (args.length) {
    const arg = args.shift();
    if (arg === '--database-ready') {
      options.databaseReady = true;
      continue;
    }
    if (arg === '--project-ready') {
      if (command !== 'build')
        throw new Error(
          '--project-ready is only valid for build jobs that already ran Expo prebuild.',
        );
      options.projectReady = true;
      continue;
    }
    const [name, inline] = arg.replace(/^--/, '').split('=');
    if (!arg.startsWith('--') || !names.has(name))
      throw new Error(`Unknown native option: ${arg}`);
    const value = inline ?? args.shift();
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for --${name}.`);
    options[
      { 'api-port': 'apiPort', 'metro-port': 'metroPort' }[name] ?? name
    ] = value;
  }
  if (!['android', 'ios', 'all'].includes(options.platform))
    throw new Error('Platform must be android, ios, or all.');
  if (options.platform === 'all' && options.device)
    throw new Error('Select one platform when choosing a device.');
  if (options.platform === 'all' && options.app)
    throw new Error('Select one platform when providing an app artifact.');
  options.apiPort = parsePort(options.apiPort);
  options.metroPort = parsePort(options.metroPort);
  if (options.metroPort !== 8081)
    throw new Error(
      'Native debug artifacts require Metro port 8081. Stop your existing Metro session before running native verification.',
    );
  if (options.apiPort === options.metroPort)
    throw new Error('API and Metro must use different ports.');
  if (
    !/^\d+$/.test(String(options.repeat)) ||
    Number(options.repeat) < 1 ||
    Number(options.repeat) > 20
  )
    throw new Error('Repeat count must be between 1 and 20.');
  options.repeat = Number(options.repeat);
  phoneDisplay(options.phone);
  return options;
};
