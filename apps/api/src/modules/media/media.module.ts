import { Module } from '@nestjs/common';
import { Controller, Post, Delete, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const AUDIO_EXT = new Set(['mp3', 'm4a', 'wav', 'aac']);

/**
 * Podcast uploads. The object key is random — the original filename (which can carry an outlet name) is never stored.
 * Client-supplied keys are ignored so a caller cannot overwrite source-mirror/ or generated/ objects.
 */
export function safeAudioUploadKey(userId: string, filename: string, contentType: string): { key: string; contentType: string } {
  const base = (filename || 'audio').split(/[/\\]/).pop() || 'audio';
  const ext = (base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const type = (contentType || '').toLowerCase().split(';')[0].trim();
  const typeOk = type === '' || type === 'application/octet-stream' || type.startsWith('audio/');
  if (!AUDIO_EXT.has(ext) || !typeOk) {
    throw new BadRequestException('Only audio uploads (mp3, m4a, wav, aac) are allowed');
  }
  const id = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'user';
  const mime = type.startsWith('audio/') ? type : ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
  return { key: `uploads/audio/${id}/${randomBytes(16).toString('hex')}.${ext}`, contentType: mime };
}

@Injectable()
class MediaService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
    this.bucket = config.get<string>('S3_BUCKET')!;
    this.s3 = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT'),
      region: config.get<string>('S3_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY')!,
        secretAccessKey: config.get<string>('S3_SECRET_KEY')!,
      },
      forcePathStyle: true,
    });
  }

  async getPresignedUrl(userId: string, filename: string, contentType: string) {
    const safe = safeAudioUploadKey(userId, filename, contentType);
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: safe.key, ContentType: safe.contentType });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    const publicUrl = `${this.config.get('S3_ENDPOINT')}/${this.bucket}/${safe.key}`;
    return { uploadUrl: url, publicUrl, s3Key: safe.key };
  }

  async delete(id: string) {
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: asset.s3Key }));
    return this.prisma.mediaAsset.delete({ where: { id } });
  }
}

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
class MediaController {
  constructor(private readonly svc: MediaService) {}

  @Post('presign')
  getPresignedUrl(
    @CurrentUser() user: { id: string },
    @Body() body: { key?: string; filename?: string; contentType?: string; mimeType?: string },
  ) {
    // `key` is accepted only as a legacy filename hint. The storage path is always generated server-side.
    const filename = body?.filename || (body?.key ? body.key.split(/[/\\]/).pop() : '') || 'audio.mp3';
    return this.svc.getPresignedUrl(user?.id ?? '', filename, body?.contentType || body?.mimeType || '');
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CHIEF_EDITOR)
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}

@Module({ controllers: [MediaController], providers: [MediaService, PrismaService] })
export class MediaModule {}
