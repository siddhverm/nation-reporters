import {
  Injectable, NestInterceptor, ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

// Logs write operations to the immutable audit_logs table
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const { method, url, user } = req;
    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

    return next.handle().pipe(
      tap(async (result) => {
        if (!writeMethods.includes(method)) return;
        await this.prisma.auditLog.create({
          data: {
            userId: user?.id ?? null,
            action: `${method} ${url}`,
            entityType: 'http',
            entityId: result?.id ?? 'unknown',
            metadata: { url, method },
          },
        });
      }),
    );
  }
}
