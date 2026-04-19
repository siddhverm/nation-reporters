import { Module } from '@nestjs/common';
import { PublishingService } from './publishing.service';
import { PublishingController } from './publishing.controller';
import { TwitterConnector } from './connectors/twitter/twitter.connector';
import { TelegramConnector } from './connectors/telegram/telegram.connector';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [PublishingController],
  providers: [PublishingService, TwitterConnector, TelegramConnector, PrismaService],
  exports: [PublishingService],
})
export class PublishingModule {}
