import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class TelegramConnector extends SocialConnector {
  readonly platform = Platform.TELEGRAM;
  private readonly logger = new Logger(TelegramConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
      const channelId = this.config.get<string>('TELEGRAM_CHANNEL_ID');
      const text = `*${payload.title}*\n\n${payload.excerpt}\n\n[Read more](${payload.url})`;

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: channelId, text, parse_mode: 'Markdown' }),
        },
      );

      const data = await res.json() as { ok: boolean; result?: { message_id: number } };
      return {
        success: data.ok,
        platformPostId: data.result?.message_id?.toString(),
        response: data,
      };
    } catch (err) {
      this.logger.error('Telegram publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
