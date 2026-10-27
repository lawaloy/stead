import { Injectable, Logger } from '@nestjs/common';

type DevPayload = {
  to: string;
  body: string;
};

@Injectable()
export class DevClient {
  private readonly logger = new Logger(DevClient.name);

  sendMessage(payload: DevPayload) {
    void payload;
    this.logger.log('Development SMS accepted');
    return {
      dev: true,
      accepted: true,
    };
  }
}
