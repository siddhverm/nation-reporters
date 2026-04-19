import { Module } from '@nestjs/common';
import { Controller, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

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

  async getPresignedUrl(key: string, contentType: string) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    const publicUrl = `${this.config.get('S3_ENDPOINT')}/${this.bucket}/${key}`;
    return { uploadUrl: url, publicUrl, s3Key: key };
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
  getPresignedUrl(@Body('key') key: string, @Body('contentType') contentType: string) {
    return this.svc.getPresignedUrl(key, contentType);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}

@Module({ controllers: [MediaController], providers: [MediaService, PrismaService] })
export class MediaModule {}
