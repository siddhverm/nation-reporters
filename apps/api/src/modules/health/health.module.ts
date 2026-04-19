import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
class HealthController {
  @Get() check() { return { status: 'ok', timestamp: new Date() }; }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
