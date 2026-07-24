jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { hostUri: undefined },
}));

describe('resolveApiBaseUrl', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    jest.resetModules();
  });

  it('uses EXPO_PUBLIC_API_URL when provided', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://192.168.1.80:3000/';
    const { resolveApiBaseUrl } = await import('../lib/base-url');
    expect(resolveApiBaseUrl()).toBe('http://192.168.1.80:3000');
  });

  it('uses expo host when env is absent', async () => {
    jest.doMock('expo-constants', () => ({
      expoConfig: { hostUri: '10.0.0.45:8081' },
    }));
    const { resolveApiBaseUrl } = await import('../lib/base-url');
    expect(resolveApiBaseUrl()).toBe('http://10.0.0.45:3000');
  });

  it('uses the Android emulator loopback host when env and expo host are absent', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
    }));
    jest.doMock('expo-constants', () => ({
      expoConfig: { hostUri: undefined },
    }));
    const { resolveApiBaseUrl } = await import('../lib/base-url');
    expect(resolveApiBaseUrl()).toBe('http://10.0.2.2:3000');
  });

  it('falls back to localhost on non-Android platforms without env or expo host', async () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock('expo-constants', () => ({
      expoConfig: { hostUri: undefined },
    }));
    const { resolveApiBaseUrl } = await import('../lib/base-url');
    expect(resolveApiBaseUrl()).toBe('http://localhost:3000');
  });
});
