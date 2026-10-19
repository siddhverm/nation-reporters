import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { SourceNamesService } from '../../common/source-names.service';
import { PublishingModule } from '../publishing/publishing.module';

@Module({
  imports: [PublishingModule],
  controllers: [ArticlesController],
  providers: [ArticlesService, PrismaService, RedisCacheService, SourceNamesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
