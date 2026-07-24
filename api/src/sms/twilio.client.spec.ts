import { EventEmitter } from 'events';
import * as https from 'https';
import { TwilioClient } from './twilio.client';

jest.mock('https');

type MockResponse = EventEmitter & { statusCode: number };
type MockRequestCallback = (response: MockResponse) => void;

describe('TwilioClient transport edges', () => {
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

    (https.request as jest.Mock).mockImplementation(
      (_options: unknown, callback: MockRequestCallback) => {
        const res = Object.assign(new EventEmitter(), { statusCode });
        callback(res);
        queueMicrotask(() => {
          res.emit('data', body);
          res.emit('end');
        });
        return req;
      },
    );

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

  it('rejects sends when the auth token is missing', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '+15557654321',
      }),
    ).rejects.toThrow('TWILIO_AUTH_TOKEN is not set');
    expect(https.request).not.toHaveBeenCalled();
  });

  it('resolves an empty success body as an empty object', async () => {
    mockRequest(201, '');

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '+15557654321',
      }),
    ).resolves.toEqual({});
  });

  it('keeps non-JSON success bodies as the raw string', async () => {
    mockRequest(200, 'not-json');

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '+15557654321',
      }),
    ).resolves.toBe('not-json');
  });

  it('attaches non-JSON error bodies as the raw response string', async () => {
    mockRequest(502, '<html>bad gateway</html>');

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '+15557654321',
      }),
    ).rejects.toMatchObject({
      message: 'Twilio API error 502',
      response: '<html>bad gateway</html>',
    });
  });

  it('rejects when the underlying request emits an error', async () => {
    const req = Object.assign(new EventEmitter(), {
      write: jest.fn(),
      end: jest.fn(),
    });
    (https.request as jest.Mock).mockImplementation(() => req);

    const pending = client.sendMessage({
      to: '+15551234567',
      body: 'OTP 123456',
      from: '+15557654321',
    });
    queueMicrotask(() => {
      req.emit('error', new Error('ECONNRESET'));
    });

    await expect(pending).rejects.toThrow('ECONNRESET');
  });
});
