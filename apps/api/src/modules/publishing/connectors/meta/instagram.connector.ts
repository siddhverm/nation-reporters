import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class InstagramConnector extends SocialConnector {
  readonly platform = Platform.INSTAGRAM;
  private readonly logger = new Logger(InstagramConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      const accountId = this.config.get<string>('INSTAGRAM_BUSINESS_ACCOUNT_ID')!;
      const token = this.config.get<string>('FACEBOOK_PAGE_TOKEN')!;

      if (!payload.imageUrl) {
        return { success: false, errorMsg: 'Instagram requires an image' };
      }

      const caption = [payload.caption || payload.title, payload.url]
        .concat(payload.hashtags?.map((h) => `#${h}`) ?? [])
        .join('\n');

      const mediaRes = await fetch(
        `https://graph.facebook.com/v19.0/${accountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: payload.imageUrl, caption, access_token: token }),
        },
      );
      const mediaData = await mediaRes.json() as { id?: string; error?: { message: string } };
      if (!mediaRes.ok || mediaData.error) throw new Error(mediaData.error?.message ?? `HTTP ${mediaRes.status}`);

      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: mediaData.id, access_token: token }),
        },
      );
      const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
      if (!publishRes.ok || publishData.error) throw new Error(publishData.error?.message ?? `HTTP ${publishRes.status}`);

      return { success: true, platformPostId: publishData.id };
    } catch (err) {
      this.logger.error('Instagram publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
