import { Module } from '@nestjs/common';
import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('feature-flags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('feature-flags')
class FeatureFlagsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() { return this.prisma.featureFlag.findMany(); }

  @Patch(':key')
  update(@Param('key') key: string, @Body('enabled') enabled: boolean) {
    return this.prisma.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled },
    });
  }
}

@Module({ controllers: [FeatureFlagsController], providers: [PrismaService] })
export class FeatureFlagsModule {}
