import { EventEmitter } from 'events';
import * as https from 'https';
import { TermiiClient } from './termii.client';

jest.mock('https');

describe('TermiiClient transport edges', () => {
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
