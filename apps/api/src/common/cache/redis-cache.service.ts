import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis | null;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.enabled = false;
      this.client = null;
      return;
    }

    this.enabled = true;
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.client) return null;
    try {
      await this.ensureConnected();
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`redis get failed key=${key} err=${(error as Error).message}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.ensureConnected();
      await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
    } catch (error) {
      this.logger.warn(`redis set failed key=${key} err=${(error as Error).message}`);
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.ensureConnected();
      const keys = await this.client.keys(`${prefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.warn(`redis del prefix failed prefix=${prefix} err=${(error as Error).message}`);
    }
  }

  async ping(): Promise<'up' | 'down'> {
    if (!this.enabled || !this.client) return 'down';
    try {
      await this.ensureConnected();
      const result = await this.client.ping();
      return result === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => null);
    }
  }

  private async ensureConnected() {
    if (!this.client) return;
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }
}
