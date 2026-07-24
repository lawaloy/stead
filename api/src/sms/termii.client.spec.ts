import { EventEmitter } from 'events';
import * as https from 'https';
import { TermiiClient } from './termii.client';

jest.mock('https');

describe('TermiiClient', () => {
  const client = new TermiiClient();
  const originalApiKey = process.env.TERMII_API_KEY;

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
    expect(JSON.parse(req.write.mock.calls[0][0] as string)).toEqual({
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
});
