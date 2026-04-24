import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiClient } from '../ai/gemini.client';
import { PublishingService } from '../publishing/publishing.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as googleTTS from 'google-tts-api';

const execFileAsync = promisify(execFile);

@Injectable()
export class VideoWorkerService {
  private readonly logger = new Logger(VideoWorkerService.name);
  private readonly enabled: boolean;
  private readonly batchSize: number;
  private readonly renderSeconds: number;
  private readonly ffmpegPath: string;
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiClient,
    private readonly publishing: PublishingService,
  ) {
    this.enabled = Boolean(this.config.get('VIDEO_GENERATION_ENABLED'));
    this.batchSize = Number(this.config.get('VIDEO_WORKER_BATCH_SIZE') ?? 5);
    this.renderSeconds = Number(this.config.get('VIDEO_RENDER_SECONDS') ?? 45);
    this.ffmpegPath = this.config.get<string>('VIDEO_FFMPEG_PATH') ?? 'ffmpeg';
    this.bucket = this.config.get<string>('S3_BUCKET') ?? '';
    this.endpoint = this.config.get<string>('S3_ENDPOINT') ?? '';
    this.s3 = new S3Client({
      endpoint: this.endpoint,
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? '',
      },
      forcePathStyle: true,
    });
  }

  @Cron('*/15 * * * *')
  async run() {
    if (!this.enabled) return;
    const candidates = await this.prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      include: { mediaAssets: true },
      orderBy: { publishedAt: 'desc' },
      take: 80,
    });

    const queue = candidates
      .filter((a) => !a.mediaAssets.some((m) => m.type === 'VIDEO'))
      .filter((a) => {
        const body = (a.body ?? {}) as Record<string, unknown>;
        const aiVideo = (body.aiVideo ?? {}) as Record<string, unknown>;
        return aiVideo.status === 'ready_for_tts_video_generation';
      })
      .slice(0, this.batchSize);

    for (const article of queue) {
      try {
        await this.generateForArticle(article.id);
      } catch (error) {
        this.logger.warn(`Video generation failed for ${article.id}: ${(error as Error).message}`);
      }
    }
  }

  private async generateForArticle(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { mediaAssets: true },
    });
    if (!article) return;

    const body = (article.body ?? {}) as Record<string, unknown>;
    const aiVideo = (body.aiVideo ?? {}) as Record<string, unknown>;
    const language = String(aiVideo.language ?? article.language ?? 'en');
    const fallbackScript = String(aiVideo.narration ?? article.podcastScript ?? article.excerpt ?? article.title);
    const script = await this.buildVideoScript(article.title, fallbackScript, language);

    const imageAsset = article.mediaAssets.find((m) => m.type === 'IMAGE');
    const workDir = path.join(os.tmpdir(), `nr-video-${article.id}-${Date.now()}`);
    await fs.mkdir(workDir, { recursive: true });
    const imagePath = path.join(workDir, 'frame.jpg');
    const audioPath = path.join(workDir, 'narration.mp3');
    const subtitlesPath = path.join(workDir, 'captions.srt');
    const videoPath = path.join(workDir, 'output.mp4');

    if (imageAsset?.url) {
      await this.downloadFile(imageAsset.url, imagePath);
    }

    await this.generateNarrationAudio(script, language, audioPath, workDir);
    await this.generateSubtitles(script, subtitlesPath);
    await this.renderVideo(imageAsset?.url ? imagePath : null, audioPath, subtitlesPath, videoPath);
    const uploadedUrl = await this.uploadVideo(article.id, videoPath);

    await this.prisma.mediaAsset.create({
      data: {
        articleId: article.id,
        type: 'VIDEO',
        url: uploadedUrl,
        s3Key: this.toS3Key(uploadedUrl),
        mimeType: 'video/mp4',
        sizeBytes: 0,
        scanStatus: 'generated',
      },
    });

    await this.prisma.article.update({
      where: { id: article.id },
      data: {
        body: {
          ...(body as object),
          aiVideo: {
            ...(aiVideo as object),
            status: 'generated',
            script,
            generatedAt: new Date().toISOString(),
            videoUrl: uploadedUrl,
          },
        },
      },
    });

    await this.publishing.publishToSocialOnly(article.id).catch(() => null);
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => null);
  }

  private async buildVideoScript(title: string, inputScript: string, language: string): Promise<string> {
    try {
      const { data } = await this.gemini.generateJson<{ script: string }>(`
You are producing a 45-second news video narration.
Return JSON:
{
  "script": "a concise, broadcast-style narration in ${language}, max 110 words"
}
Headline: ${title}
Draft script: ${inputScript}
      `);
      return data.script || inputScript;
    } catch {
      return inputScript;
    }
  }

  private async renderVideo(
    imagePath: string | null,
    audioPath: string,
    subtitlesPath: string,
    outputPath: string,
  ) {
    const subtitleFilter = `subtitles='${subtitlesPath.replace(/\\/g, '/').replace(':', '\\:')}'`;
    if (imagePath) {
      await execFileAsync(this.ffmpegPath, [
        '-y',
        '-loop', '1',
        '-i', imagePath,
        '-i', audioPath,
        '-vf', `scale=1280:720,format=yuv420p,${subtitleFilter}`,
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        outputPath,
      ]);
      return;
    }

    await execFileAsync(this.ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=1280x720:d=${this.renderSeconds}`,
      '-i', audioPath,
      '-vf', subtitleFilter,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      outputPath,
    ]);
  }

  private async generateNarrationAudio(script: string, language: string, outputPath: string, workDir: string) {
    const chunks = this.splitScript(script, 180);
    const chunkPaths: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const url = googleTTS.getAudioUrl(chunk, {
        lang: this.normalizeTtsLang(language),
        slow: false,
        host: 'https://translate.google.com',
      });
      const out = path.join(workDir, `tts-${i}.mp3`);
      await this.downloadFile(url, out);
      chunkPaths.push(out);
    }

    const concatFile = path.join(workDir, 'tts-concat.txt');
    const list = chunkPaths.map((p) => `file '${p.replace(/'/g, "'\\''").replace(/\\/g, '/')}'`).join('\n');
    await fs.writeFile(concatFile, list, 'utf8');
    await execFileAsync(this.ffmpegPath, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c', 'copy',
      outputPath,
    ]);
  }

  private async generateSubtitles(script: string, outputPath: string) {
    const lines = this.splitScript(script, 70);
    const words = Math.max(1, script.split(/\s+/).filter(Boolean).length);
    const totalSeconds = Math.max(10, this.renderSeconds);
    const perWord = totalSeconds / words;
    let cursor = 0;
    const blocks: string[] = [];
    lines.forEach((line, idx) => {
      const lineWords = Math.max(1, line.split(/\s+/).filter(Boolean).length);
      const duration = Math.max(1.5, lineWords * perWord);
      const start = cursor;
      const end = Math.min(totalSeconds, cursor + duration);
      blocks.push(`${idx + 1}\n${this.toSrtTime(start)} --> ${this.toSrtTime(end)}\n${line}\n`);
      cursor = end;
    });
    await fs.writeFile(outputPath, blocks.join('\n'), 'utf8');
  }

  private splitScript(text: string, maxChars: number): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return ['Nation Reporters video update.'];
    const sentences = normalized.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence;
      if (next.length <= maxChars) {
        current = next;
      } else {
        if (current) chunks.push(current);
        if (sentence.length <= maxChars) {
          current = sentence;
        } else {
          const parts = sentence.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [sentence];
          chunks.push(...parts.slice(0, -1));
          current = parts[parts.length - 1] ?? '';
        }
      }
    }
    if (current) chunks.push(current);
    return chunks.slice(0, 40);
  }

  private toSrtTime(seconds: number): string {
    const ms = Math.floor((seconds % 1) * 1000);
    const total = Math.floor(seconds);
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  private normalizeTtsLang(language: string): string {
    const map: Record<string, string> = {
      en: 'en',
      hi: 'hi',
      mr: 'mr',
      bn: 'bn',
      ta: 'ta',
      te: 'te',
      kn: 'kn',
      gu: 'gu',
      pa: 'pa',
      ur: 'ur',
      ar: 'ar',
      fr: 'fr',
      de: 'de',
      es: 'es',
      pt: 'pt',
      ru: 'ru',
      zh: 'zh-CN',
      ja: 'ja',
      ko: 'ko',
      id: 'id',
      tr: 'tr',
      it: 'it',
    };
    return map[language.toLowerCase()] ?? 'en';
  }

  private async downloadFile(url: string, targetPath: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image ${url}`);
    const arr = await res.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(arr));
  }

  private async uploadVideo(articleId: string, localPath: string): Promise<string> {
    const key = `generated/videos/${articleId}-${Date.now()}.mp4`;
    const body = await fs.readFile(localPath);
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: 'video/mp4',
    }));
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  private toS3Key(url: string): string {
    const marker = `/${this.bucket}/`;
    const idx = url.indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : url;
  }
}
