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

describe('TermiiClient', () => {
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

  it('rejects sends when TERMII_API_KEY is missing', async () => {
    delete process.env.TERMII_API_KEY;

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
      }),
    ).rejects.toThrow('TERMII_API_KEY is not set');
    expect(https.request).not.toHaveBeenCalled();
  });

  it('resolves an empty success body as an empty object', async () => {
    mockRequest(200, '');

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
      }),
    ).resolves.toEqual({});
  });

  it('keeps non-JSON success bodies as the raw string', async () => {
    mockRequest(200, 'ok');

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
      }),
    ).resolves.toBe('ok');
  });

  it('posts plain SMS with the default generic channel', async () => {
    const req = mockRequest(200, JSON.stringify({ message_id: 'tm_1' }));

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
      }),
    ).resolves.toEqual({ message_id: 'tm_1' });

    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        hostname: 'api.ng.termii.com',
        path: '/api/sms/send',
      }),
      expect.any(Function),
    );
    const [[requestBody]] = req.write.mock.calls;

    expect(JSON.parse(requestBody)).toEqual({
      to: '2348012345678',
      from: 'STEAD',
      sms: 'OTP 123456',
      type: 'plain',
      channel: 'generic',
      api_key: 'termii-key',
    });
  });

  it('rejects HTTP error responses with the parsed body attached', async () => {
    mockRequest(401, JSON.stringify({ message: 'Invalid API key' }));

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
        channel: 'dnd',
      }),
    ).rejects.toMatchObject({
      message: 'Termii API error 401',
      response: { message: 'Invalid API key' },
    });
  });

  it('attaches non-JSON error bodies as the raw response string', async () => {
    mockRequest(503, 'upstream unavailable');

    await expect(
      client.sendMessage({
        to: '2348012345678',
        from: 'STEAD',
        sms: 'OTP 123456',
      }),
    ).rejects.toMatchObject({
      message: 'Termii API error 503',
      response: 'upstream unavailable',
    });
  });

  it('rejects when the underlying request emits an error', async () => {
    const req = Object.assign(new EventEmitter(), {
      write: jest.fn(),
      end: jest.fn(),
    });
    (https.request as jest.Mock).mockImplementation(() => req);

    const pending = client.sendMessage({
      to: '2348012345678',
      from: 'STEAD',
      sms: 'OTP 123456',
    });
    queueMicrotask(() => {
      req.emit('error', new Error('ENOTFOUND'));
    });

    await expect(pending).rejects.toThrow('ENOTFOUND');
  });
});
