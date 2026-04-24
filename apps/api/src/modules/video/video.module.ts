import { Module } from '@nestjs/common';
import { VideoWorkerService } from './video.worker.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiModule } from '../ai/ai.module';
import { PublishingModule } from '../publishing/publishing.module';

@Module({
  imports: [AiModule, PublishingModule],
  providers: [VideoWorkerService, PrismaService],
})
export class VideoModule {}
