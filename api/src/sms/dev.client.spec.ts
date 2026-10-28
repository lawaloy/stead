import { Logger } from '@nestjs/common';
import { DevClient } from './dev.client';

describe('DevClient', () => {
  let client: DevClient;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    client = new DevClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('acknowledges dev messages without returning the OTP body', () => {
    const payload = {
      to: '+2348012345678',
      body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
    };

    expect(client.sendMessage(payload)).toEqual({
      dev: true,
      accepted: true,
    });
  });

  it('logs neither the destination nor the OTP body', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    client.sendMessage({
      to: '+14155552671',
      body: 'Your Stead OTP is 654321. It expires in 10 minutes.',
    });

    expect(logSpy).toHaveBeenCalledWith('Development SMS accepted');
    const output = logSpy.mock.calls.flat().join(' ');
    expect(output).not.toContain('+14155552671');
    expect(output).not.toContain('654321');
  });
});
