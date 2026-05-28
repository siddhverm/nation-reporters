import { Injectable, OnModuleInit } from '@nestjs/common';
import { RegionalIngestionService } from './regional-ingestion.service';

@Injectable()
export class RegionalIngestionBootstrapService implements OnModuleInit {
  constructor(private readonly regional: RegionalIngestionService) {}

  onModuleInit() {
    setTimeout(() => void this.regional.runBootstrap({ minPerLang: 5 }), 8_000);
  }
}
