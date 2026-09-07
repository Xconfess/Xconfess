export enum NotificationDeliveryState {
  CREATED = 'created',
  QUEUED = 'queued',
  SENT = 'sent',
  SKIPPED = 'skipped',
  FAILED = 'failed',
  RETRIED = 'retried',
  DEAD_LETTERED = 'dead-lettered',
}

export type NotificationDeliveryOutcome =
  | {
      state: NotificationDeliveryState.QUEUED;
      queue: string;
      jobName: string;
      jobId?: string;
    }
  | {
      state: NotificationDeliveryState.SKIPPED;
      reason: string;
      queue?: string;
      jobId?: string;
    };
