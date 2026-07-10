import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, type Producer, logLevel } from 'kafkajs';
import type { DomainEvent } from '@gain/shared';
import type { EventPublisher } from '../../domain/identity/ports/infrastructure.ports';

@Injectable()
export class KafkaEventPublisher
  implements EventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaEventPublisher.name);
  private producer!: Producer;
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const brokers = this.config
      .getOrThrow<string>('KAFKA_BROKERS')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    const kafka = new Kafka({
      clientId: this.config.getOrThrow<string>('KAFKA_CLIENT_ID'),
      brokers,
      logLevel: logLevel.WARN,
      retry: { retries: 5 },
    });

    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: true,
    });

    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
    } catch (error) {
      this.connected = false;
      this.logger.warn(
        `Kafka unavailable at startup; outbox relay will retry: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
    }
  }

  async publish(topic: string, event: DomainEvent): Promise<void> {
    if (!this.connected) {
      try {
        await this.producer.connect();
        this.connected = true;
      } catch (error) {
        throw new Error(
          `Kafka producer not connected: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.producer.send({
      topic,
      messages: [
        {
          key: event.aggregateId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.eventType,
            correlationId: event.correlationId,
            aggregateType: event.aggregateType,
          },
        },
      ],
    });
  }

  async isHealthy(): Promise<boolean> {
    return this.connected;
  }
}
