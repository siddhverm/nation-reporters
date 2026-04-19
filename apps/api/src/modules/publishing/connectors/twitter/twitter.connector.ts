import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class TwitterConnector extends SocialConnector {
  readonly platform = Platform.TWITTER;
  private readonly logger = new Logger(TwitterConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      const { TwitterApi } = await import('twitter-api-v2');
      const client = new TwitterApi({
        appKey: this.config.get<string>('TWITTER_API_KEY')!,
        appSecret: this.config.get<string>('TWITTER_API_SECRET')!,
        accessToken: this.config.get<string>('TWITTER_ACCESS_TOKEN')!,
        accessSecret: this.config.get<string>('TWITTER_ACCESS_SECRET')!,
      });

      const text = `${payload.caption || payload.title}\n${payload.url}`.slice(0, 280);
      const tweet = await client.v2.tweet(text);

      return { success: true, platformPostId: tweet.data.id };
    } catch (err) {
      this.logger.error('Twitter publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
