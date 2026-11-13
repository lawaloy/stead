import { EventEmitter } from 'events';
import * as https from 'https';
import * as querystring from 'querystring';
import { TwilioClient } from './twilio.client';

jest.mock('https');

type MockResponse = EventEmitter & { statusCode: number };
type MockRequest = EventEmitter & {
  write: jest.MockedFunction<(chunk: string) => void>;
  end: jest.MockedFunction<() => void>;
};
type MockRequestCallback = (response: MockResponse) => void;

describe('TwilioClient empty vs whitespace From and Messaging SID', () => {
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

  it('omits empty-string From and Messaging SID from the form body and forwards whitespace-only values', async () => {
    const emptyReq = mockRequest(201, JSON.stringify({ sid: 'SM-empty' }));

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: '',
        messagingServiceSid: '',
      }),
    ).resolves.toEqual({ sid: 'SM-empty' });

    const [[emptyBody]] = emptyReq.write.mock.calls;
    const emptyFields = querystring.parse(emptyBody);

    expect(emptyFields).toEqual({
      To: '+15551234567',
      Body: 'OTP 123456',
    });
    expect(emptyBody).not.toContain('From=');
    expect(emptyBody).not.toContain('MessagingServiceSid=');

    const whitespaceReq = mockRequest(
      201,
      JSON.stringify({ sid: 'SM-whitespace' }),
    );

    await expect(
      client.sendMessage({
        to: '+15551234567',
        body: 'OTP 123456',
        from: ' \t\n ',
        messagingServiceSid: ' \t\n ',
      }),
    ).resolves.toEqual({ sid: 'SM-whitespace' });

    const [[whitespaceBody]] = whitespaceReq.write.mock.calls;
    const whitespaceFields = querystring.parse(whitespaceBody);

    expect(whitespaceFields).toEqual({
      To: '+15551234567',
      Body: 'OTP 123456',
      From: ' \t\n ',
      MessagingServiceSid: ' \t\n ',
    });
  });
});
