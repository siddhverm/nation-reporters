import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class ThreadsConnector extends SocialConnector {
  readonly platform = Platform.THREADS;
  private readonly logger = new Logger(ThreadsConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      const userId = this.config.get<string>('THREADS_USER_ID')!;
      const token = this.config.get<string>('THREADS_ACCESS_TOKEN')!;

      const text = `${payload.caption || payload.title}\n${payload.url}`;

      const containerRes = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'TEXT',
            text,
            access_token: token,
          }),
        },
      );
      const container = await containerRes.json() as { id?: string; error?: { message: string } };
      if (!containerRes.ok || container.error) throw new Error(container.error?.message ?? `HTTP ${containerRes.status}`);

      const publishRes = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: container.id, access_token: token }),
        },
      );
      const published = await publishRes.json() as { id?: string; error?: { message: string } };
      if (!publishRes.ok || published.error) throw new Error(published.error?.message ?? `HTTP ${publishRes.status}`);

      return { success: true, platformPostId: published.id };
    } catch (err) {
      this.logger.error('Threads publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
