import { Module } from '@nestjs/common';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { safeInt } from '../../common/safe-int.util';

type HealthRequest = { user?: unknown };

/**
 * Health endpoints.
 * - `/health/live`: liveness only (used by scripts/deploy-production.sh).
 * - `/health` and `/health/ready`: status + counts for everyone. Source names / feed URLs (the
 *   stale-source list) are only included for an authenticated CMS user, so the public response
 *   never reveals which outlets we ingest from.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
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
  @UseGuards(OptionalJwtAuthGuard)
  async ready(@Req() req?: HealthRequest) {
    return this.buildReport(Boolean(req?.user));
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async check(@Req() req?: HealthRequest) {
    return this.buildReport(Boolean(req?.user));
  }

  async buildReport(includeDetails: boolean) {
    const now = new Date();
    const expectedHours = safeInt(this.config.get('INGESTION_EXPECTED_INTERVAL_HOURS'), 10, 1, 24 * 30);
    const staleCutoff = new Date(Date.now() - expectedHours * 60 * 60 * 1000);
    const redis = await this.redisCache.ping();
    const staleWhere = {
      isActive: true,
      OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: staleCutoff } }],
    };

    const [activeSources, staleSourceCount, staleSources] = await Promise.all([
      this.prisma.ingestedSource.count({ where: { isActive: true } }),
      this.prisma.ingestedSource.count({ where: staleWhere }),
      includeDetails
        ? this.prisma.ingestedSource.findMany({
          where: staleWhere,
          select: { id: true, name: true, feedUrl: true, lastFetchedAt: true },
          take: 20,
        })
        : Promise.resolve(null),
    ]);

    const status = redis === 'up' && staleSourceCount === 0 ? 'ok' : 'degraded';
    const ingestion: Record<string, unknown> = {
      activeSources,
      staleSourceCount,
      expectedIntervalHours: expectedHours,
    };
    if (!includeDetails) {
      return { status, timestamp: now, checks: { redis, ingestion } };
    }
    return {
      status,
      timestamp: now,
      checks: { redis, ingestion: { ...ingestion, staleSources } },
      recommendations: staleSourceCount > 0
        ? [
            'Review stale feed URLs in Sources Admin',
            'Ensure fallback/global sources are enabled to maintain quota',
            'Inspect ingestion logs for repeated parser/network failures',
          ]
        : [],
    };
  }
}

@Module({
  controllers: [HealthController],
  providers: [PrismaService, RedisCacheService],
})
export class HealthModule {}
