import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { Resend } from 'resend';
import {
  VERIFY_CODE_EMAIL_SUBJECT,
  buildVerifyCodeEmail,
  buildVerifyCodeText,
} from '../../common/email/templates/verify-code.email';
import { TooManyRequestsException } from '../../common/too-many-requests.exception';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const PUBLIC_GOOGLE_CLIENT_ID =
  '692705532429-vln2fhilsu85c1sjia0uftafigsmembn.apps.googleusercontent.com';

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
    this.googleClient = new OAuth2Client();
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
      throw new UnauthorizedException('ユーザーが見つかりません。');
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
      throw new TooManyRequestsException('60秒後にもう一度お試しください。');
    }

    if (ipCount >= 5) {
      throw new TooManyRequestsException(
        'アクセスが集中しています。しばらくしてからもう一度お試しください。',
      );
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

    let emailSent = false;
    try {
      if (this.resend) {
        await this.resend.emails.send({
          from:
            this.configService.get<string>('MAIL_FROM') ??
            'Docs <no-reply@official.meritledger.org>',
          to: normalizedEmail,
          subject: VERIFY_CODE_EMAIL_SUBJECT,
          html: buildVerifyCodeEmail(code),
          text: buildVerifyCodeText(code),
        });
        emailSent = true;
      }
    } catch (error) {
      if (!this.isDevelopment()) {
        throw error;
      }
    }

    return {
      ok: true,
      emailSent,
      ...(this.isDevelopment() && !emailSent ? { devCode: code } : {}),
    };
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
      throw new UnauthorizedException('認証コードが正しくありません。');
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
    const clientIds = this.getGoogleClientIds();
    if (clientIds.length === 0) {
      throw new BadRequestException('Googleログイン設定が不足しています。');
    }

    let ticket: LoginTicket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientIds,
      });
    } catch {
      throw new UnauthorizedException('Googleログインの認証に失敗しました。');
    }
    const payload = ticket.getPayload();

    if (!payload?.email || !payload.sub) {
      throw new UnauthorizedException('Googleログインの認証に失敗しました。');
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
        secret:
          this.configService.get<string>('JWT_SECRET') ?? 'docs-dev-secret',
        expiresIn: '30d',
      },
    );
  }

  private getGoogleClientIds() {
    return [
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID'),
      PUBLIC_GOOGLE_CLIENT_ID,
    ]
      .flatMap((value) => this.parseClientIds(value))
      .filter((value, index, all) => all.indexOf(value) === index);
  }

  private parseClientIds(value: string | undefined) {
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  private isDevelopment() {
    return this.configService.get<string>('NODE_ENV') !== 'production';
  }
}
