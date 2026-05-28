import { Module } from '@nestjs/common';
import { SourcesService } from './sources/sources.service';
import { SourcesController } from './sources/sources.controller';
import { IngestionCronService } from './cron/ingestion-cron.service';
import { RegionalIngestionBootstrapService } from './regional-ingestion-bootstrap.service';
import { RegionalIngestionService } from './regional-ingestion.service';
import { IngestionBootstrapController } from './ingestion-bootstrap.controller';
import { DedupService } from './dedup/dedup.service';
import { ProvenanceService } from './provenance/provenance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiModule } from '../ai/ai.module';
import { PublishingModule } from '../publishing/publishing.module';

@Module({
  imports: [AiModule, PublishingModule],
  controllers: [SourcesController, IngestionBootstrapController],
  providers: [
    SourcesService,
    IngestionCronService,
    RegionalIngestionService,
    RegionalIngestionBootstrapService,
    DedupService,
    ProvenanceService,
    PrismaService,
  ],
  exports: [SourcesService, IngestionCronService],
})
export class IngestionModule {}
