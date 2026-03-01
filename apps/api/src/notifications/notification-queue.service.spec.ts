import { NotificationQueueService } from './notification-queue.service';

describe('NotificationQueueService', () => {
  let queue: NotificationQueueService;

  beforeEach(() => {
    jest.useFakeTimers();
    queue = new NotificationQueueService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enqueues and claims otp job', () => {
    queue.enqueueOtpRequested({ phone: '+2348000000000', otp: '123456' });

    const job = queue.claimReadyJob();

    expect(job).not.toBeNull();
    expect(job?.type).toBe('otp.requested');
    expect(job?.attempts).toBe(0);
    if (job) queue.markSucceeded(job.id);
  });

  it('moves job to dead letter queue after max attempts', () => {
    queue.enqueueOtpRequested({ phone: '+2348000000000', otp: '123456' });

    for (let i = 0; i < 3; i++) {
      let job = queue.claimReadyJob();
      if (!job) {
        jest.advanceTimersByTime(30_000);
        job = queue.claimReadyJob();
      }
      expect(job).not.toBeNull();
      if (!job) break;
      queue.markFailed(job, new Error('provider down'));
    }

    expect(queue.getDeadLetterDepth()).toBe(1);
  });
});
