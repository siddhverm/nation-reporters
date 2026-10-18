import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GeminiClient } from './gemini.client';
import { StoryImageService } from './story-image.service';
import { StoryImageController } from './story-image.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishingModule } from '../publishing/publishing.module';

@Module({
  imports: [forwardRef(() => PublishingModule)],
  controllers: [AiController, StoryImageController],
  providers: [AiService, GeminiClient, StoryImageService, PrismaService],
  exports: [AiService, GeminiClient, StoryImageService],
})
export class AiModule {}
