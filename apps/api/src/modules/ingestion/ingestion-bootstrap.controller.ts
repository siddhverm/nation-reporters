import { Controller, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { RegionalIngestionService } from './regional-ingestion.service';

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
    @Query('force') force?: string,
  ) {
    const expected = this.config.get<string>('INGESTION_BOOTSTRAP_KEY');
    if (!expected || key !== expected) {
      throw new UnauthorizedException('Invalid or missing bootstrap key');
    }
    return this.regional.runBootstrap({ force: force === '1' || force === 'true' });
  }
}
