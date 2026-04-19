import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GeminiClient } from './gemini.client';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [AiController],
  providers: [AiService, GeminiClient, PrismaService],
  exports: [AiService, GeminiClient],
})
export class AiModule {}
