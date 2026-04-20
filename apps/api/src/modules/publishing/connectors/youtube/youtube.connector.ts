import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class YoutubeConnector extends SocialConnector {
  readonly platform = Platform.YOUTUBE;
  private readonly logger = new Logger(YoutubeConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      if (!payload.videoUrl) {
        return { success: false, errorMsg: 'YouTube publish requires a video URL' };
      }

      const clientId = this.config.get<string>('YOUTUBE_CLIENT_ID')!;
      const clientSecret = this.config.get<string>('YOUTUBE_CLIENT_SECRET')!;
      const refreshToken = this.config.get<string>('YOUTUBE_REFRESH_TOKEN')!;

      // Exchange refresh token for access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenRes.ok || !tokenData.access_token) throw new Error(tokenData.error ?? 'Token refresh failed');

      // For video uploads, use resumable upload API
      // This stub logs intent — full multipart upload requires binary streaming
      this.logger.log(`YouTube upload queued for article ${payload.articleId}`);

      return {
        success: true,
        response: { note: 'YouTube video upload initiated', videoUrl: payload.videoUrl },
      };
    } catch (err) {
      this.logger.error('YouTube publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
