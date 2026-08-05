import { Logger } from '@nestjs/common';
import { DevClient } from './dev.client';

describe('DevClient phone masking edges', () => {
  let client: DevClient;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    client = new DevClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['', '1', '12', '123', '1234'])(
    'leaves short destination %p unmasked in the acceptance log',
    (phone) => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      client.sendMessage({
        to: phone,
        body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
      });

      expect(logSpy).toHaveBeenCalledWith(`DEV SMS accepted to=${phone}`);
      expect(logSpy.mock.calls.flat().join(' ')).not.toContain('123456');
    },
  );

  it('masks destinations longer than four characters', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    client.sendMessage({
      to: '12345',
      body: 'Your Stead OTP is 123456. It expires in 10 minutes.',
    });

    expect(logSpy).toHaveBeenCalledWith('DEV SMS accepted to=1234***45');
  });
});
