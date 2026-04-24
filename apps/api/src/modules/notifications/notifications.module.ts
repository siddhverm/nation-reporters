import { Module } from '@nestjs/common';
import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@Controller('notifications')
class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
  }

  @Post('subscribe-webpush')
  async subscribeWebPush(@Body() body: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    language?: string;
    userAgent?: string;
  }) {
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return { ok: false, message: 'Invalid subscription payload' };
    }

    await this.prisma.webPushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        language: body.language,
        userAgent: body.userAgent,
        isActive: true,
      },
      create: {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        language: body.language,
        userAgent: body.userAgent,
        isActive: true,
      },
    });

    return { ok: true };
  }
}

@Module({ controllers: [NotificationsController], providers: [PrismaService] })
export class NotificationsModule {}
