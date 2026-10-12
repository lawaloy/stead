import { NotificationConsumerService } from './notification-consumer.service';

describe('NotificationConsumerService startup redaction failure', () => {
  it('fails closed and does not start polling when terminal redaction rejects', async () => {
    const queue = {
      claimReadyJob: jest.fn(),
      markSucceeded: jest.fn(),
      markFailed: jest.fn(),
      redactTerminalPayloads: jest
        .fn()
        .mockRejectedValue(new Error('terminal redaction unavailable')),
      canDeliver: jest.fn(),
    };
    const sms = {
      sendOtp: jest.fn(),
      sendMessage: jest.fn(),
    };
    const service = new NotificationConsumerService(
      queue as never,
      sms as never,
    );
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation(() => 0 as unknown as NodeJS.Timeout);

    await expect(service.onModuleInit()).rejects.toThrow(
      'terminal redaction unavailable',
    );

    expect(queue.redactTerminalPayloads).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(queue.claimReadyJob).not.toHaveBeenCalled();
    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(sms.sendMessage).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });
});
