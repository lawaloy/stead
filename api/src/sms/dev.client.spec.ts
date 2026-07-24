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

  it('returns the message body so DEV_EXPOSE_OTP can surface the OTP', () => {
    const payload = {
      to: '+2348012345678',
      body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
    };

    expect(client.sendMessage(payload)).toEqual({
      dev: true,
      logged: true,
      body: payload.body,
    });
  });

  it('logs the destination and body without calling external SMS APIs', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    client.sendMessage({
      to: '+14155552671',
      body: 'Your Stead OTP is 654321. It expires in 10 minutes.',
    });

    expect(logSpy).toHaveBeenCalledWith(
      'DEV SMS to=+14155552671 body=Your Stead OTP is 654321. It expires in 10 minutes.',
    );
  });
});
