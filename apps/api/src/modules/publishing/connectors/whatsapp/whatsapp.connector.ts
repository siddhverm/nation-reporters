import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { SocialConnector, PublishPayload, PublishResult } from '../base.connector';

@Injectable()
export class WhatsappConnector extends SocialConnector {
  readonly platform = Platform.WHATSAPP;
  private readonly logger = new Logger(WhatsappConnector.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    try {
      const apiUrl = this.config.get<string>('WHATSAPP_API_URL')!;
      const token = this.config.get<string>('WHATSAPP_API_TOKEN')!;
      const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID')!;
      const channelId = this.config.get<string>('WHATSAPP_CHANNEL_ID')!;

      const message = `*${payload.title}*\n\n${payload.excerpt || payload.caption || ''}\n\n${payload.url}`;

      const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: channelId,
          type: 'text',
          text: { body: message },
        }),
      });

      const data = await res.json() as { messages?: { id: string }[]; error?: { message: string } };
      if (!res.ok || data.error) throw new Error(data.error?.message ?? `HTTP ${res.status}`);

      return { success: true, platformPostId: data.messages?.[0]?.id };
    } catch (err) {
      this.logger.error('WhatsApp publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }
}
