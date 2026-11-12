describe('env', () => {
  const originalEnv = {
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
    EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
      process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  };
  const originalNodeEnv = process.env.NODE_ENV;

  const restoreEnv = (
    key: keyof typeof originalEnv,
    value: string | undefined,
  ) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  const restoreNodeEnv = () => {
    process.env.NODE_ENV = originalNodeEnv ?? 'test';
  };

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE;
    restoreNodeEnv();
    jest.resetModules();
  });

  afterAll(() => {
    restoreEnv('EXPO_PUBLIC_API_URL', originalEnv.EXPO_PUBLIC_API_URL);
    restoreEnv('EXPO_PUBLIC_APP_ENV', originalEnv.EXPO_PUBLIC_APP_ENV);
    restoreEnv('EXPO_PUBLIC_SENTRY_DSN', originalEnv.EXPO_PUBLIC_SENTRY_DSN);
    restoreEnv(
      'EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE',
      originalEnv.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    );
    restoreNodeEnv();
  });

  it('accepts a valid EXPO_PUBLIC_API_URL', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.80:3000';
    const { env } = await import('../lib/env');
    expect(env.EXPO_PUBLIC_API_URL).toBe('http://192.168.1.80:3000');
  });

  it('allows EXPO_PUBLIC_API_URL to be omitted', async () => {
    const { env } = await import('../lib/env');
    expect(env.EXPO_PUBLIC_API_URL).toBeUndefined();
  });

  it('rejects a non-URL EXPO_PUBLIC_API_URL at module load', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'not-a-url';
    await expect(import('../lib/env')).rejects.toThrow();
  });

  it('rejects an unknown EXPO_PUBLIC_APP_ENV at module load', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'preview';
    await expect(import('../lib/env')).rejects.toThrow(/EXPO_PUBLIC_APP_ENV/);
  });

  it('defaults APP_ENV to development when it is omitted outside production', async () => {
    const { env } = await import('../lib/env');
    expect(env.EXPO_PUBLIC_APP_ENV).toBe('development');
  });

  it('defaults APP_ENV to production when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';
    const { env } = await import('../lib/env');
    expect(env.EXPO_PUBLIC_APP_ENV).toBe('production');
  });

  it('rejects a traces sample rate outside 0..1 at module load', async () => {
    process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE = '1.5';
    await expect(import('../lib/env')).rejects.toThrow(
      /EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE/,
    );
  });

  it('rejects a non-URL EXPO_PUBLIC_SENTRY_DSN at module load', async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'not-a-url';
    await expect(import('../lib/env')).rejects.toThrow(
      /EXPO_PUBLIC_SENTRY_DSN/,
    );
  });

  it('treats an empty EXPO_PUBLIC_SENTRY_DSN as omitted', async () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = '';
    const { env } = await import('../lib/env');
    expect(env.EXPO_PUBLIC_SENTRY_DSN).toBeUndefined();
  });

  it('accepts a bounded traces sample rate in a known app env', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'test';
    process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE = '0.25';
    const { env } = await import('../lib/env');
    expect(env.EXPO_PUBLIC_APP_ENV).toBe('test');
    expect(env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE).toBe(0.25);
  });
});
