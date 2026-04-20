import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class LinkedinConnector extends SocialConnector {
  readonly platform = Platform.LINKEDIN;
  private readonly logger = new Logger(LinkedinConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      const accessToken = this.config.get<string>('LINKEDIN_ACCESS_TOKEN')!;
      const authorUrn = this.config.get<string>('LINKEDIN_AUTHOR_URN')!;

      const body = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: `${payload.caption || payload.title}\n${payload.url}` },
            shareMediaCategory: payload.imageUrl ? 'IMAGE' : 'ARTICLE',
            media: payload.imageUrl
              ? undefined
              : [{ status: 'READY', originalUrl: payload.url, title: { text: payload.title } }],
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { id?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);

      return { success: true, platformPostId: data.id };
    } catch (err) {
      this.logger.error('LinkedIn publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
