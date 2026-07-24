describe('env', () => {
  const originalUrl = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    jest.resetModules();
  });

  afterAll(() => {
    if (originalUrl === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL;
    } else {
      process.env.EXPO_PUBLIC_API_URL = originalUrl;
    }
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
});
