import { SteadLogger } from './stead-logger';

describe('SteadLogger empty vs whitespace LOG_FORMAT', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const writeFor = (environment: NodeJS.ProcessEnv) => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new SteadLogger({
      ...environment,
      LOG_LEVEL: environment.LOG_LEVEL ?? 'info',
    });
    logger.log('Safe event', { operation: 'verify' });
    return write.mock.calls.map((call) => String(call[0])).join('');
  };

  it('emits JSON when LOG_FORMAT is omitted and text when it is empty or whitespace-only', () => {
    const omitted = writeFor({});
    expect(JSON.parse(omitted)).toMatchObject({
      message: 'Safe event',
      operation: 'verify',
    });

    const empty = writeFor({ LOG_FORMAT: '' });
    expect(empty).toContain('Safe event');
    expect(() => {
      JSON.parse(empty.trim());
    }).toThrow();

    const whitespace = writeFor({ LOG_FORMAT: ' \t\n ' });
    expect(whitespace).toContain('Safe event');
    expect(() => {
      JSON.parse(whitespace.trim());
    }).toThrow();
  });
});
