import { Module } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/cache/redis-cache.service';

@Module({
  controllers: [ArticlesController],
  providers: [ArticlesService, PrismaService, RedisCacheService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
