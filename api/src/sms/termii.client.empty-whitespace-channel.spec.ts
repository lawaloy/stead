import { EventEmitter } from 'events';
import * as https from 'https';
import { TermiiClient } from './termii.client';

jest.mock('https');

type MockResponse = EventEmitter & { statusCode: number };
type MockRequest = EventEmitter & {
  write: jest.MockedFunction<(chunk: string) => void>;
  end: jest.MockedFunction<() => void>;
};
type MockRequestCallback = (response: MockResponse) => void;

describe('TermiiClient empty vs whitespace channel', () => {
  const client = new TermiiClient();
  const originalApiKey = process.env.TERMII_API_KEY;

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
    process.env.TERMII_API_KEY = 'termii-key';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.TERMII_API_KEY;
    } else {
      process.env.TERMII_API_KEY = originalApiKey;
    }
  });

  it('defaults an empty-string channel to generic and forwards whitespace-only channels', async () => {
    const emptyReq = mockRequest(
      200,
      JSON.stringify({ message_id: 'tm-empty-channel' }),
    );

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
        channel: '',
      }),
    ).resolves.toEqual({ message_id: 'tm-empty-channel' });

    const [[emptyBody]] = emptyReq.write.mock.calls;
    expect(JSON.parse(emptyBody)).toEqual({
      to: '2348012345678',
      from: 'STEAD',
      sms: 'OTP 123456',
      type: 'plain',
      channel: 'generic',
      api_key: 'termii-key',
    });

    const whitespaceReq = mockRequest(
      200,
      JSON.stringify({ message_id: 'tm-whitespace-channel' }),
    );

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
        channel: ' \t\n ',
      }),
    ).resolves.toEqual({ message_id: 'tm-whitespace-channel' });

    const [[whitespaceBody]] = whitespaceReq.write.mock.calls;
    expect(JSON.parse(whitespaceBody)).toEqual({
      to: '2348012345678',
      from: 'STEAD',
      sms: 'OTP 123456',
      type: 'plain',
      channel: ' \t\n ',
      api_key: 'termii-key',
    });
  });
});
