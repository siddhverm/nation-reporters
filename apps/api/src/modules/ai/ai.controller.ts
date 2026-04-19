import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}

  @Post('captions/:articleId')
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN, Role.SOCIAL_MANAGER)
  regenerateCaptions(@Param('articleId') id: string) {
    return this.svc.regenerateCaptions(id);
  }

  @Get('risk/:articleId')
  @Roles(Role.CHIEF_EDITOR, Role.ADMIN)
  getRisk(@Param('articleId') id: string) {
    return this.svc.getRisk(id);
  }

  @Post('translate')
  translate(
    @Body('text') text: string,
    @Body('from') from: string,
    @Body('to') to: string,
  ) {
    return this.svc.translate(text, from, to);
  }
}
