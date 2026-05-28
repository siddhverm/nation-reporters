import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

const READ_MORE_TEXT: Record<string, string> = {
  en: 'Read more',
  hi: 'और पढ़ें',
  mr: 'अधिक वाचा',
  bn: 'আরও পড়ুন',
  ta: 'மேலும் படிக்க',
  te: 'మరింత చదవండి',
  kn: 'ಇನ್ನಷ್ಟು ಓದಿ',
  ml: 'കൂടുതൽ വായിക്കുക',
  gu: 'વધુ વાંચો',
  pa: 'ਹੋਰ ਪੜ੍ਹੋ',
  ur: 'مزید پڑھیں',
  ar: 'اقرأ المزيد',
  fr: 'Lire la suite',
  de: 'Mehr lesen',
  es: 'Leer más',
  pt: 'Leia mais',
  ru: 'Читать далее',
  zh: '阅读更多',
  ja: '続きを読む',
  ko: '자세히 읽기',
  id: 'Baca selengkapnya',
  tr: 'Devamını oku',
  it: 'Leggi di più',
};

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

      const lang = payload.language ?? 'en';
      const readMoreText = READ_MORE_TEXT[lang] ?? READ_MORE_TEXT['en'];

      const escapeHtml = (value: string) =>
        value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const title = escapeHtml(payload.title ?? '');
      const excerpt = escapeHtml((payload.excerpt ?? '').slice(0, 900));
      const url = encodeURI(payload.url ?? '');
      const captionText = `<b>${title}</b>\n\n${excerpt}\n\n<a href="${url}">${readMoreText}</a>`;

      // Use sendPhoto when image is available and looks like a public HTTPS URL
      const usePhoto =
        !!payload.imageUrl &&
        payload.imageUrl.startsWith('https://') &&
        !payload.imageUrl.includes('localhost');

      if (usePhoto) {
        const result = await this.sendPhoto(botToken, channelId, payload.imageUrl!, captionText.slice(0, 1024));
        if (result.ok) {
          return {
            success: true,
            platformPostId: result.result?.message_id?.toString(),
            response: result,
          };
        }
        // Fall through to text-only if photo send fails
        this.logger.warn(`Telegram sendPhoto failed (${result.error_code}): ${result.description} — falling back to text`);
      }

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: channelId,
            text: captionText,
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

  private async sendPhoto(
    botToken: string,
    channelId: string,
    photoUrl: string,
    caption: string,
  ): Promise<{ ok: boolean; description?: string; error_code?: number; result?: { message_id: number } }> {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          photo: photoUrl,
          caption,
          parse_mode: 'HTML',
        }),
      },
    );
    return res.json();
  }
}
