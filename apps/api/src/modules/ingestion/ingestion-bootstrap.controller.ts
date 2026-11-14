import { timingSafeEqual } from 'crypto';
import { Controller, Post, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { RegionalIngestionService } from './regional-ingestion.service';

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** Manual regional feed bootstrap (VPS: curl with INGESTION_BOOTSTRAP_KEY). */
@ApiTags('ingestion')
@Controller('ingestion')
export class IngestionBootstrapController {
  constructor(
    private readonly regional: RegionalIngestionService,
    private readonly config: ConfigService,
  ) {}

  @Post('bootstrap-regional')
  async bootstrapRegional(
    @Query('key') key?: string,
    @Headers('x-bootstrap-key') headerKey?: string,
    @Query('force') force?: string,
  ) {
    const expected = this.config.get<string>('INGESTION_BOOTSTRAP_KEY');
    const provided = headerKey || key || '';
    if (!expected || !keysMatch(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing bootstrap key');
    }
    return this.regional.runBootstrap({ force: force === '1' || force === 'true' });
  }
}
