import { EventEmitter } from 'events';
import * as https from 'https';
import { TwilioClient } from './twilio.client';

jest.mock('https');

describe('TwilioClient', () => {
  const client = new TwilioClient();
  const originalEnv = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  };

  const mockRequest = (statusCode: number, body: string) => {
    const req = Object.assign(new EventEmitter(), {
      write: jest.fn(),
      end: jest.fn(),
    });

    (https.request as jest.Mock).mockImplementation((_options, callback) => {
      const res = Object.assign(new EventEmitter(), { statusCode });
      callback(res);
      queueMicrotask(() => {
        res.emit('data', body);
        res.emit('end');
      });
      return req;
    });

    return req;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('rejects sends when account credentials are missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID;

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '+15557654321',
      }),
    ).rejects.toThrow('TWILIO_ACCOUNT_SID is not set');
    expect(https.request).not.toHaveBeenCalled();
  });

  it('posts MessagingServiceSid when From is omitted', async () => {
    const req = mockRequest(201, JSON.stringify({ sid: 'SM123' }));

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        messagingServiceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      }),
    ).resolves.toEqual({ sid: 'SM123' });

    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        hostname: 'api.twilio.com',
        path: '/2010-04-01/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Messages.json',
        auth: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx:twilio-token',
      }),
      expect.any(Function),
    );
    expect(req.write).toHaveBeenCalledWith(
      expect.stringContaining(
        'MessagingServiceSid=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      ),
    );
    expect(req.write).toHaveBeenCalledWith(
      expect.not.stringContaining('From='),
    );
  });

  it('rejects HTTP error responses with the parsed body attached', async () => {
    mockRequest(400, JSON.stringify({ message: 'invalid to' }));

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '+15557654321',
      }),
    ).rejects.toMatchObject({
      message: 'Twilio API error 400',
      response: { message: 'invalid to' },
    });
  });
});
