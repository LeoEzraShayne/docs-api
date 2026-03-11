import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { CookieJwtGuard } from '../../common/cookie-jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { getRequestIp } from '../../common/ip';
import type { RequestWithMeta } from '../../common/request-id.middleware';
import { AuthService } from './auth.service';

class StartAuthDto {
  @IsEmail()
  email!: string;
}

class VerifyAuthDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

class GoogleAuthDto {
  @IsString()
  idToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(CookieJwtGuard)
  async me(@CurrentUser() user: { userId: string; email: string }) {
    return this.authService.getCurrentUser(user.userId);
  }

  @Post('start')
  async start(
    @Body() body: StartAuthDto,
    @Req() req: RequestWithMeta,
  ) {
    return this.authService.startEmailLogin(body.email, getRequestIp(req));
  }

  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body() body: VerifyAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmailCode(body.email, body.code);
    this.attachCookie(res, result.token);
    return result;
  }

  @Post('google')
  @HttpCode(200)
  async google(
    @Body() body: GoogleAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithGoogle(body.idToken);
    this.attachCookie(res, result.token);
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('auth_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return { ok: true };
  }

  private attachCookie(res: Response, token: string) {
    res.cookie('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
}
