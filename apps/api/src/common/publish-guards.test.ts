import 'reflect-metadata';
import { Role } from '@prisma/client';
import { redactUrl } from './redact-url.util';
import { safeAudioUploadKey } from '../modules/media/media.module';
import { AuthController } from '../modules/auth/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

describe('publish guards', () => {
  it('redacts secrets in logged URLs', () => {
    expect(redactUrl('/api/v1/ingestion/bootstrap-regional?key=super-secret&force=1')).toBe(
      '/api/v1/ingestion/bootstrap-regional?key=[redacted]&force=1',
    );
    expect(redactUrl('/api/v1/auth/refresh?token=abc')).not.toContain('abc');
  });

  it('audio upload keys are random and cannot target source-mirror or keep the outlet filename', () => {
    const a = safeAudioUploadKey('user-1', 'Daily Planet Gazette interview.mp3', 'audio/mpeg');
    expect(a.key).toMatch(/^uploads\/audio\/user-1\/[a-f0-9]{32}\.mp3$/);
    expect(a.key).not.toMatch(/planet|gazette|source-mirror/i);
    expect(a.contentType).toBe('audio/mpeg');
    expect(() => safeAudioUploadKey('user-1', 'source-mirror/images/a1.jpg', 'image/jpeg')).toThrow(/audio/i);
    expect(safeAudioUploadKey('../evil', 'clip.wav', '').key.startsWith('uploads/audio/')).toBe(true);
  });

  it('registration requires an admin role guard (a normal login cannot create admins)', () => {
    const guards = Reflect.getMetadata('__guards__', AuthController.prototype.register);
    expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata('roles', AuthController.prototype.register)).toEqual([Role.ADMIN]);
  });
});
