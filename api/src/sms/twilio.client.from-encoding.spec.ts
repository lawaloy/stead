import { EventEmitter } from 'events';
import * as https from 'https';
import { TwilioClient } from './twilio.client';

jest.mock('https');

type MockResponse = EventEmitter & { statusCode: number };
type MockRequest = EventEmitter & {
  write: jest.MockedFunction<(chunk: string) => void>;
  end: jest.MockedFunction<() => void>;
};
type MockRequestCallback = (response: MockResponse) => void;

describe('TwilioClient form encoding', () => {
  const client = new TwilioClient();
  const originalEnv = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  };

  const mockRequest = (statusCode: number, body: string) => {
    const req: MockRequest = Object.assign(new EventEmitter(), {
      write: jest.fn<void, [string]>(),
      end: jest.fn<void, []>(),
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

  it('percent-encodes From=+… as From=%2B in the form body', async () => {
    const req = mockRequest(201, JSON.stringify({ sid: 'SM123' }));

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '+15557654321',
      }),
    ).resolves.toEqual({ sid: 'SM123' });

    const [[written]] = req.write.mock.calls;

    expect(written).toContain('From=%2B15557654321');
    expect(written).toContain('To=%2B15551234567');
    expect(written).not.toContain('From=+15557654321');
  });

  it('includes both From and MessagingServiceSid when both are provided', async () => {
    const req = mockRequest(201, JSON.stringify({ sid: 'SM456' }));

    await client.sendMessage({
      to: '+15551234567',
      body: 'OTP 123456',
      from: '+15557654321',
      messagingServiceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    });

    const [[written]] = req.write.mock.calls;

    expect(written).toContain('From=%2B15557654321');
    expect(written).toContain(
      'MessagingServiceSid=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    );
  });
});
