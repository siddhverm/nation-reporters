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
      if (!botToken || !channelId) {
        return { success: false, errorMsg: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID' };
      }

      const escapeHtml = (value: string) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      const title = escapeHtml(payload.title ?? '');
      const excerpt = escapeHtml(payload.excerpt ?? '');
      const url = encodeURI(payload.url ?? '');
      const text = `<b>${title}</b>\n\n${excerpt}\n\n<a href="${url}">Read more</a>`;

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }),
        },
      );

      const data = await res.json() as {
        ok: boolean;
        description?: string;
        error_code?: number;
        result?: { message_id: number };
      };
      if (!data.ok) {
        this.logger.warn(`Telegram API rejected post: ${data.error_code ?? 'unknown'} ${data.description ?? ''}`);
      }
      return {
        success: res.ok && data.ok,
        platformPostId: data.result?.message_id?.toString(),
        response: data,
        errorMsg: data.ok ? undefined : data.description ?? 'Telegram API error',
      };
    } catch (err) {
      this.logger.error('Telegram publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
