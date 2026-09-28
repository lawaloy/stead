import { QueuedNotificationPublisher } from './queued-notification.publisher';

describe('QueuedNotificationPublisher', () => {
  let publisher: QueuedNotificationPublisher;
  let queue: {
    enqueueOtpRequested: jest.Mock;
    isOtpRequestEnqueued: jest.Mock;
    enqueueReadinessAlert: jest.Mock;
  };

  beforeEach(() => {
    queue = {
      enqueueOtpRequested: jest.fn(),
      isOtpRequestEnqueued: jest.fn(),
      enqueueReadinessAlert: jest.fn(),
    };
    publisher = new QueuedNotificationPublisher(queue as never);
  });

  it('waits for otp notification jobs to be persisted', async () => {
    queue.enqueueOtpRequested.mockResolvedValue('job_1');

    await expect(
      publisher.publishOtpRequested({
        userId: 'user_1',
        otpCodeId: 'otp_1',
        dedupeKey: 'otp.requested:key-hash',
        payload: { phone: '+2348012345678', otp: '123456' },
      }),
    ).resolves.toBeUndefined();

    expect(queue.enqueueOtpRequested).toHaveBeenCalledWith(
      { phone: '+2348012345678', otp: '123456' },
      'user_1',
      'otp_1',
      'otp.requested:key-hash',
    );
  });

  it('surfaces notification job persistence failures', async () => {
    queue.enqueueOtpRequested.mockRejectedValue(new Error('database down'));

    await expect(
      publisher.publishOtpRequested({
        userId: 'user_1',
        otpCodeId: 'otp_1',
        dedupeKey: 'otp.requested:key-hash',
        payload: { phone: '+2348012345678', otp: '123456' },
      }),
    ).rejects.toThrow('database down');
  });

  it('reports whether an OTP notification is already enqueued', async () => {
    queue.isOtpRequestEnqueued.mockResolvedValue(true);

    await expect(
      publisher.isOtpRequestEnqueued('otp.requested:key-hash', 'otp_1'),
    ).resolves.toBe(true);
    expect(queue.isOtpRequestEnqueued).toHaveBeenCalledWith(
      'otp.requested:key-hash',
      'otp_1',
    );
  });

  it('returns the readiness enqueue result without swallowing collisions', async () => {
    const input = {
      type: 'risk.alert' as const,
      userId: 'user_1',
      goalId: 'goal_1',
      dedupeKey: 'risk.alert:user_1:goal_1:initial',
      payload: {
        phone: '+2348012345678',
        body: 'Review your savings pace.',
      },
    };
    queue.enqueueReadinessAlert
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(publisher.publishReadinessAlert(input)).resolves.toBe(true);
    await expect(publisher.publishReadinessAlert(input)).resolves.toBe(false);
    expect(queue.enqueueReadinessAlert).toHaveBeenNthCalledWith(1, input);
    expect(queue.enqueueReadinessAlert).toHaveBeenNthCalledWith(2, input);
  });

  it('surfaces readiness enqueue failures', async () => {
    queue.enqueueReadinessAlert.mockRejectedValue(new Error('database down'));

    await expect(
      publisher.publishReadinessAlert({
        type: 'risk.recovery',
        userId: 'user_1',
        goalId: 'goal_1',
        dedupeKey: 'risk.recovery:user_1:goal_1:initial',
        payload: {
          phone: '+2348012345678',
          body: 'Rent has recovered to stable (score 72).',
        },
      }),
    ).rejects.toThrow('database down');
  });
});
