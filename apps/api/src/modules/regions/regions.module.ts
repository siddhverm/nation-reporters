import { Module } from '@nestjs/common';
import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('regions')
@Controller('regions')
class RegionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()  findAll() { return this.prisma.region.findMany({ orderBy: { name: 'asc' } }); }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)
  @Post() create(@Body() dto: { name: string; slug: string; country: string }) {
    return this.prisma.region.create({ data: dto });
  }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)
  @Delete(':id') delete(@Param('id') id: string) {
    return this.prisma.region.delete({ where: { id } });
  }
}

@Module({ controllers: [RegionsController], providers: [PrismaService] })
export class RegionsModule {}
