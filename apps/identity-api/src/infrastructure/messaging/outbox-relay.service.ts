import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { DomainEvent } from '@gain/shared';
import {
  EVENT_PUBLISHER,
  OUTBOX_REPOSITORY,
} from '../../domain/identity/tokens';
import type {
  EventPublisher,
  OutboxRepository,
} from '../../domain/identity/ports/infrastructure.ports';

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;

  constructor(
    @Inject(OUTBOX_REPOSITORY)
    private readonly outbox: OutboxRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly publisher: EventPublisher,
  ) {}

  @Interval(2000)
  async relay(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const messages = await this.outbox.claimPending(50);
      for (const message of messages) {
        try {
          const event = message.payload as unknown as DomainEvent;
          await this.publisher.publish(message.topic, event);
          await this.outbox.markPublished(message.id);
        } catch (error) {
          const errMsg =
            error instanceof Error ? error.message : String(error);
          const delay = Math.min(60_000, 2_000 * (message.attempts + 1));
          await this.outbox.markFailed(message.id, errMsg, delay);
          this.logger.warn(
            `Outbox publish failed for ${message.id}: ${errMsg}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
