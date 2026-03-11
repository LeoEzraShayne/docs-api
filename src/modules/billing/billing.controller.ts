import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CookieJwtGuard } from '../../common/cookie-jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { BillingService } from './billing.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  @Get('me')
  @UseGuards(CookieJwtGuard)
  me(@CurrentUser() user: { userId: string }) {
    return this.entitlementsService.getBillingSummary(user.userId);
  }

  @Get('portal')
  @UseGuards(CookieJwtGuard)
  portal(@CurrentUser() user: { userId: string }) {
    return this.billingService.createPortal(user.userId);
  }

  @Post('checkout/oneshot')
  @UseGuards(CookieJwtGuard)
  checkoutOneshot(@CurrentUser() user: { userId: string }) {
    return this.billingService.createOneshotCheckout(user.userId);
  }

  @Post('checkout/subscription')
  @UseGuards(CookieJwtGuard)
  checkoutSubscription(@CurrentUser() user: { userId: string }) {
    return this.billingService.createSubscriptionCheckout(user.userId);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Headers('stripe-signature') signature: string | undefined, @Req() req: RawBodyRequest<Request>) {
    const rawBody =
      req.rawBody instanceof Buffer
        ? req.rawBody
        : Buffer.from(JSON.stringify(req.body ?? {}));
    return this.billingService.handleWebhook(signature, rawBody);
  }
}
