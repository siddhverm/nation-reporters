import { Module } from '@nestjs/common';
import { SourcesService } from './sources/sources.service';
import { SourcesController } from './sources/sources.controller';
import { IngestionCronService } from './cron/ingestion-cron.service';
import { DedupService } from './dedup/dedup.service';
import { ProvenanceService } from './provenance/provenance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [SourcesController],
  providers: [SourcesService, IngestionCronService, DedupService, ProvenanceService, PrismaService],
  exports: [SourcesService, IngestionCronService],
})
export class IngestionModule {}
