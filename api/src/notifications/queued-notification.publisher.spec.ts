import { QueuedNotificationPublisher } from './queued-notification.publisher';

describe('QueuedNotificationPublisher', () => {
  let publisher: QueuedNotificationPublisher;
  let queue: { enqueueOtpRequested: jest.Mock };

  beforeEach(() => {
    queue = { enqueueOtpRequested: jest.fn() };
    publisher = new QueuedNotificationPublisher(queue as never);
  });

  it('waits for otp notification jobs to be persisted', async () => {
    queue.enqueueOtpRequested.mockResolvedValue('job_1');

    await expect(
      publisher.publishOtpRequested({
        phone: '+2348012345678',
        otp: '123456',
      }),
    ).resolves.toBeUndefined();

    expect(queue.enqueueOtpRequested).toHaveBeenCalledWith({
      phone: '+2348012345678',
      otp: '123456',
    });
  });

  it('surfaces notification job persistence failures', async () => {
    queue.enqueueOtpRequested.mockRejectedValue(new Error('database down'));

    await expect(
      publisher.publishOtpRequested({
        phone: '+2348012345678',
        otp: '123456',
      }),
    ).rejects.toThrow('database down');
  });
});
