import { Platform } from '@prisma/client';

export interface PublishPayload {
  articleId: string;
  title: string;
  excerpt: string;
  url: string;
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  hashtags?: string[];
  platform: Platform;
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  response?: object;
  errorMsg?: string;
}

export abstract class SocialConnector {
  abstract readonly platform: Platform;

  abstract publish(payload: PublishPayload): Promise<PublishResult>;

  protected buildPublicUrl(articleId: string, slug: string) {
    return `https://nationreporters.com/article/${slug}`;
  }
}
