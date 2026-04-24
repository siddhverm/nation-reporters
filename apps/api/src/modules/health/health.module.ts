import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../../common/cache/redis-cache.service';

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date() };
  }

  @Get('ready')
  async ready() {
    const now = new Date();
    const expectedHours = Number(this.config.get('INGESTION_EXPECTED_INTERVAL_HOURS') ?? 10);
    const staleCutoff = new Date(Date.now() - expectedHours * 60 * 60 * 1000);
    const redis = await this.redisCache.ping();

    const [activeSources, staleSources] = await Promise.all([
      this.prisma.ingestedSource.count({ where: { isActive: true } }),
      this.prisma.ingestedSource.findMany({
        where: { isActive: true, OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: staleCutoff } }] },
        select: { id: true, name: true, feedUrl: true, lastFetchedAt: true },
        take: 20,
      }),
    ]);

    const status = redis === 'up' && staleSources.length === 0 ? 'ok' : 'degraded';
    return {
      status,
      timestamp: now,
      checks: {
        redis,
        ingestion: {
          activeSources,
          staleSourceCount: staleSources.length,
          expectedIntervalHours: expectedHours,
          staleSources,
        },
      },
      recommendations: staleSources.length > 0
        ? [
            'Review stale feed URLs in Sources Admin',
            'Ensure fallback/global sources are enabled to maintain quota',
            'Inspect ingestion logs for repeated parser/network failures',
          ]
        : [],
    };
  }

  @Get()
  async check() {
    return this.ready();
  }
}

@Module({
  controllers: [HealthController],
  providers: [PrismaService, RedisCacheService],
})
export class HealthModule {}
