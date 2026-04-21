import { Module } from '@nestjs/common';
import { PublishingService } from './publishing.service';
import { PublishingController } from './publishing.controller';
import { SocialDigestService } from './social-digest.service';
import { TwitterConnector } from './connectors/twitter/twitter.connector';
import { TelegramConnector } from './connectors/telegram/telegram.connector';
import { MetaConnector } from './connectors/meta/meta.connector';
import { InstagramConnector } from './connectors/meta/instagram.connector';
import { YoutubeConnector } from './connectors/youtube/youtube.connector';
import { LinkedinConnector } from './connectors/linkedin/linkedin.connector';
import { ThreadsConnector } from './connectors/threads/threads.connector';
import { WhatsappConnector } from './connectors/whatsapp/whatsapp.connector';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [PublishingController],
  providers: [
    PublishingService,
    SocialDigestService,
    TwitterConnector,
    TelegramConnector,
    MetaConnector,
    InstagramConnector,
    YoutubeConnector,
    LinkedinConnector,
    ThreadsConnector,
    WhatsappConnector,
    PrismaService,
  ],
  exports: [PublishingService],
})
export class PublishingModule {}
