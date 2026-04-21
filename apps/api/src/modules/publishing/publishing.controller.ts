import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JobStatus, Platform, Role } from '@prisma/client';
import { PublishingService } from './publishing.service';
import { SocialDigestService } from './social-digest.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('publish-jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('publish-jobs')
export class PublishingController {
  constructor(
    private readonly svc: PublishingService,
    private readonly digest: SocialDigestService,
  ) {}

  @Get()
  getJobs(
    @Query('platform') platform?: Platform,
    @Query('status') status?: JobStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.getJobs({ platform, status, page, limit });
  }

  @Get('dlq')
  @Roles(Role.ADMIN)
  getDlq() {
    return this.svc.getDlq();
  }

  @Post(':id/retry')
  @Roles(Role.ADMIN, Role.SOCIAL_MANAGER)
  retry(@Param('id') id: string) {
    return this.svc.retryJob(id);
  }

  @Post('digest/trigger')
  @Roles(Role.ADMIN, Role.SOCIAL_MANAGER)
  triggerDigest(@Query('limit') limit?: number) {
    return this.digest.triggerManual(limit ? +limit : undefined);
  }
}
