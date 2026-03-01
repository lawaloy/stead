import { Injectable } from '@nestjs/common';
import * as https from 'https';

type TermiiPayload = {
  to: string;
  from: string;
  sms: string;
  channel?: string;
};

@Injectable()
export class TermiiClient {
  async sendMessage(payload: TermiiPayload) {
    const apiKey = process.env.TERMII_API_KEY;
    if (!apiKey) throw new Error('TERMII_API_KEY is not set');

    const body = JSON.stringify({
      to: payload.to,
      from: payload.from,
      sms: payload.sms,
      type: 'plain',
      channel: payload.channel || 'generic',
      api_key: apiKey,
    });

    const options: https.RequestOptions = {
      method: 'POST',
      hostname: 'api.ng.termii.com',
      path: '/api/sms/send',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    return this.postJson(options, body);
  }

  private postJson(options: https.RequestOptions, data: string) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: unknown = raw;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            // keep raw response
          }

          if (res.statusCode && res.statusCode >= 400) {
            const err = new Error(`Termii API error ${res.statusCode}`) as Error & {
              response?: unknown;
            };
            err.response = parsed;
            return reject(err);
          }

          resolve(parsed);
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}
