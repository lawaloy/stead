import { runWithCorrelationId } from './request-context';
import { SteadLogger } from './stead-logger';

describe('SteadLogger text format', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts secrets and keeps correlation ids when LOG_FORMAT is text', () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const logger = new SteadLogger({
      LOG_FORMAT: 'text',
      LOG_LEVEL: 'info',
    });

    runWithCorrelationId('request_123', () => {
      logger.log('Safe event', {
        phone: '+2348012345678',
        otp: '654321',
        accessToken: 'secret-token',
      });
    });

    expect(write).toHaveBeenCalled();
    const serialized = write.mock.calls.map((call) => String(call[0])).join('');
    expect(serialized).toContain('Safe event');
    expect(serialized).toContain('request_123');
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain('+2348012345678');
    expect(serialized).not.toContain('654321');
    expect(serialized).not.toContain('secret-token');
    expect(() => {
      JSON.parse(serialized.trim());
    }).toThrow();
  });
});
