import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class MetaConnector extends SocialConnector {
  readonly platform = Platform.FACEBOOK;
  private readonly logger = new Logger(MetaConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      const pageId = this.config.get<string>('FACEBOOK_PAGE_ID')!;
      const token = this.config.get<string>('FACEBOOK_PAGE_TOKEN')!;
      const message = `${payload.caption || payload.title}\n\n${payload.url}`;

      const body: Record<string, string> = { message, access_token: token };
      if (payload.imageUrl) {
        body['link'] = payload.url;
        body['picture'] = payload.imageUrl;
      }

      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { id?: string; error?: { message: string } };
      if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);

      return { success: true, platformPostId: data.id };
    } catch (err) {
      this.logger.error('Facebook publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
