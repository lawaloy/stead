import { SteadLogger } from './stead-logger';

describe('SteadLogger empty vs whitespace LOG_LEVEL', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const writeFor = (environment: NodeJS.ProcessEnv) => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new SteadLogger({
      LOG_FORMAT: 'json',
      ...environment,
    });
    logger.debug('Debug event');
    logger.log('Info event');
    return write.mock.calls.map((call) => String(call[0])).join('');
  };

  it('keeps omitted LOG_LEVEL at info and enables debug when it is empty or whitespace-only', () => {
    const omitted = writeFor({});
    expect(omitted).toContain('Info event');
    expect(omitted).not.toContain('Debug event');

    const empty = writeFor({ LOG_LEVEL: '' });
    expect(empty).toContain('Info event');
    expect(empty).toContain('Debug event');

    const whitespace = writeFor({ LOG_LEVEL: ' \t\n ' });
    expect(whitespace).toContain('Info event');
    expect(whitespace).toContain('Debug event');
  });
});
