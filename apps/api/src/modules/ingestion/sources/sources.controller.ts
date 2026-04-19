import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SourcesService } from './sources.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@ApiTags('sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('sources')
export class SourcesController {
  constructor(private readonly svc: SourcesService) {}

  @Get()    findAll() { return this.svc.findAll(); }
  @Post()   create(@Body() dto: any) { return this.svc.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: any) { return this.svc.update(id, dto); }
  @Delete(':id') delete(@Param('id') id: string) { return this.svc.delete(id); }
  @Post(':id/fetch-now') fetchNow(@Param('id') id: string) { return this.svc.fetchNow(id); }
}
