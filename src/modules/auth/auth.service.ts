import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { Resend } from 'resend';
import { TooManyRequestsException } from '../../common/too-many-requests.exception';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly resend: Resend | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = resendApiKey ? new Resend(resendApiKey) : null;
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        googleSub: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        authProvider: user.googleSub ? 'google' : 'email',
        createdAt: user.createdAt,
      },
    };
  }

  async startEmailLogin(email: string, ip: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date();
    const emailCooldownAt = new Date(now.getTime() - 60_000);
    const ipWindowAt = new Date(now.getTime() - 60_000);

    const [recentEmailCode, ipCount] = await Promise.all([
      this.prisma.loginCode.findFirst({
        where: {
          email: normalizedEmail,
          createdAt: { gte: emailCooldownAt },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.loginCode.count({
        where: {
          ip,
          createdAt: { gte: ipWindowAt },
        },
      }),
    ]);

    if (recentEmailCode) {
      throw new TooManyRequestsException('Please wait 60 seconds before retrying');
    }

    if (ipCount >= 5) {
      throw new TooManyRequestsException('Too many requests from this IP');
    }

    const user = await this.usersService.upsertEmailUser(normalizedEmail);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(now.getTime() + 10 * 60_000);

    await this.prisma.loginCode.create({
      data: {
        email: normalizedEmail,
        code,
        ip,
        expiresAt,
        userId: user.id,
      },
    });

    if (this.resend) {
      await this.resend.emails.send({
        from:
          this.configService.get<string>('MAIL_FROM') ??
          'Docs <no-reply@official.meritledger.org>',
        to: normalizedEmail,
        subject: '登录验证码',
        text: `你的验证码是 ${code}，10分钟内有效。`,
      });
    }

    return { ok: true };
  }

  async verifyEmailCode(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const loginCode = await this.prisma.loginCode.findFirst({
      where: {
        email: normalizedEmail,
        code,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!loginCode) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.prisma.loginCode.update({
      where: { id: loginCode.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.usersService.upsertEmailUser(normalizedEmail);
    const token = this.signJwt(user.id, user.email);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async loginWithGoogle(idToken: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('GOOGLE_CLIENT_ID is not configured');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const user = await this.usersService.upsertGoogleUser(
      payload.email.toLowerCase(),
      payload.sub,
    );
    const token = this.signJwt(user.id, user.email);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  signJwt(userId: string, email: string) {
    return this.jwtService.sign(
      { sub: userId, email },
      {
        secret: this.configService.get<string>('JWT_SECRET') ?? 'docs-dev-secret',
        expiresIn: '30d',
      },
    );
  }
}
