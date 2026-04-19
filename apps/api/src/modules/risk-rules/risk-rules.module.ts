import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('risk-rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.CHIEF_EDITOR)
@Controller('risk-rules')
class RiskRulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()    findAll() { return this.prisma.riskRule.findMany(); }
  @Post()   create(@Body() dto: any) { return this.prisma.riskRule.create({ data: dto }); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: any) { return this.prisma.riskRule.update({ where: { id }, data: dto }); }
  @Delete(':id') delete(@Param('id') id: string) { return this.prisma.riskRule.delete({ where: { id } }); }
}

@Module({ controllers: [RiskRulesController], providers: [PrismaService] })
export class RiskRulesModule {}
