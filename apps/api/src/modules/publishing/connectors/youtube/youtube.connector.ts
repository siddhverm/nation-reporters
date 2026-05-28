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
    if (!payload.videoUrl) {
      return { success: false, errorMsg: 'YouTube publish requires a video URL' };
    }

    const clientId = this.config.get<string>('YOUTUBE_CLIENT_ID');
    const clientSecret = this.config.get<string>('YOUTUBE_CLIENT_SECRET');
    const refreshToken = this.config.get<string>('YOUTUBE_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      return { success: false, errorMsg: 'YouTube credentials not configured' };
    }

    try {
      const accessToken = await this.refreshAccessToken(clientId, clientSecret, refreshToken);

      const videoBuffer = await this.downloadBuffer(payload.videoUrl);
      if (!videoBuffer || videoBuffer.length === 0) {
        return { success: false, errorMsg: 'Failed to download video for YouTube upload' };
      }

      const lang = payload.language ?? 'en';
      const description = [
        payload.excerpt ?? '',
        '',
        payload.url ?? '',
        (payload.hashtags ?? []).map((h) => `#${h}`).join(' '),
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 5000);

      const videoId = await this.uploadToYoutube(accessToken, videoBuffer, {
        title: (payload.title ?? 'News Update').slice(0, 100),
        description,
        tags: (payload.hashtags ?? []).slice(0, 10),
        defaultLanguage: lang,
      });

      this.logger.log(`YouTube upload success: https://www.youtube.com/watch?v=${videoId}`);
      return {
        success: true,
        platformPostId: videoId,
        response: { videoId, youtubeUrl: `https://www.youtube.com/watch?v=${videoId}` },
      };
    } catch (err) {
      this.logger.error('YouTube publish failed', err);
      return { success: false, errorMsg: String(err) };
    }
  }

  private async refreshAccessToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (!res.ok || !data.access_token) {
      throw new Error(data.error ?? 'YouTube token refresh failed');
    }
    return data.access_token;
  }

  private async downloadBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Video download failed: HTTP ${res.status} for ${url.slice(0, 80)}`);
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  private async uploadToYoutube(
    accessToken: string,
    videoBuffer: Buffer,
    meta: { title: string; description: string; tags: string[]; defaultLanguage: string },
  ): Promise<string> {
    const metadata = {
      snippet: {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        categoryId: '25', // News & Politics
        defaultLanguage: meta.defaultLanguage,
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    };

    // Step 1: Initiate resumable upload session
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(videoBuffer.length),
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(`YouTube upload init failed: ${initRes.status} ${errText.slice(0, 200)}`);
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) throw new Error('No upload URL in YouTube resumable upload response');

    // Step 2: Upload the video bytes
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(videoBuffer.length),
      },
      body: new Uint8Array(videoBuffer),
    });

    if (!uploadRes.ok && uploadRes.status !== 201) {
      const errText = await uploadRes.text();
      throw new Error(`YouTube video upload failed: ${uploadRes.status} ${errText.slice(0, 200)}`);
    }

    const data = (await uploadRes.json()) as { id?: string; error?: { message: string } };
    if (!data.id) throw new Error(data.error?.message ?? 'No video ID in YouTube upload response');
    return data.id;
  }
}
