import { Logger } from '@nestjs/common';
import { DevClient } from './dev.client';

describe('DevClient sensitive-data logging', () => {
  let client: DevClient;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    client = new DevClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['', '1', '12', '123', '1234', '12345'])(
    'does not log destination %p or the message body',
    (phone) => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      client.sendMessage({
        to: phone,
        body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
      });

      expect(logSpy).toHaveBeenCalledWith('Development SMS accepted');
      const output = logSpy.mock.calls.flat().join(' ');
      expect(output).not.toContain(phone || 'Your Stead OTP');
      expect(output).not.toContain('123456');
    },
  );
});
