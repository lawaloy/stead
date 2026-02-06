import { Injectable } from '@nestjs/common';
import * as https from 'https';
import * as querystring from 'querystring';

type TwilioMessagePayload = {
  to: string;
  body: string;
  from?: string;
  messagingServiceSid?: string;
};

@Injectable()
export class TwilioClient {
  async sendMessage(payload: TwilioMessagePayload) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid) throw new Error('TWILIO_ACCOUNT_SID is not set');
    if (!authToken) throw new Error('TWILIO_AUTH_TOKEN is not set');

    const postData = querystring.stringify({
      To: payload.to,
      Body: payload.body,
      ...(payload.from ? { From: payload.from } : {}),
      ...(payload.messagingServiceSid ? { MessagingServiceSid: payload.messagingServiceSid } : {}),
    });

    const options: https.RequestOptions = {
      method: 'POST',
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      auth: `${accountSid}:${authToken}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    return this.postForm(options, postData);
  }

  private postForm(options: https.RequestOptions, data: string) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any = raw;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            // keep raw string
          }

          if (res.statusCode && res.statusCode >= 400) {
            const err = new Error(`Twilio API error ${res.statusCode}`);
            (err as any).response = parsed;
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
