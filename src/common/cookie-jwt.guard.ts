import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { RequestWithMeta } from './request-id.middleware';

type JwtPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class CookieJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithMeta>();
    const cookies: unknown = req.cookies;
    const token =
      cookies &&
      typeof cookies === 'object' &&
      'auth_token' in cookies &&
      typeof cookies.auth_token === 'string'
        ? cookies.auth_token
        : undefined;

    if (!token) {
      throw new UnauthorizedException('ログインが必要です。');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret:
          this.configService.get<string>('JWT_SECRET') ?? 'docs-dev-secret',
      });

      req.user = {
        userId: payload.sub,
        email: payload.email,
      };

      return true;
    } catch {
      throw new UnauthorizedException('ログイン状態を確認できません。');
    }
  }
}
