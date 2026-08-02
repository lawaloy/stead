import { Injectable, Logger } from '@nestjs/common';

type DevPayload = {
  to: string;
  body: string;
};

@Injectable()
export class DevClient {
  private readonly logger = new Logger(DevClient.name);

  sendMessage(payload: DevPayload) {
    this.logger.log(`DEV SMS accepted to=${this.maskPhone(payload.to)}`);
    return {
      dev: true,
      accepted: true,
    };
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
  }
}
