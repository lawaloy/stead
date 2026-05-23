import { Injectable, Logger } from '@nestjs/common';

type DevPayload = {
  to: string;
  body: string;
};

@Injectable()
export class DevClient {
  private readonly logger = new Logger(DevClient.name);

  sendMessage(payload: DevPayload) {
    // In dev mode we don't call external APIs. Log the message and
    // return a minimal response that includes the body so callers
    // can surface the OTP in dev-only contexts if allowed.
    this.logger.log(`DEV SMS to=${payload.to} body=${payload.body}`);
    return {
      dev: true,
      logged: true,
      body: payload.body,
    };
  }
}
