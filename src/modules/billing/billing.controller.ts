import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { DocumentType } from '@prisma/client';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CookieJwtGuard } from '../../common/cookie-jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { BillingService } from './billing.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { BillingAccountService } from './billing-account.service';

class PurchaseHistoryQuery {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsIn([10, 30, 50])
  pageSize?: number;
}

class SingleDocumentCheckoutBody {
  @IsOptional()
  @IsIn(Object.values(DocumentType))
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;
}

class ConfirmCheckoutBody {
  @IsString()
  sessionId!: string;
}

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly entitlementsService: EntitlementsService,
    private readonly billingAccountService: BillingAccountService,
  ) {}

  @Get('me')
  @UseGuards(CookieJwtGuard)
  me(@CurrentUser() user: { userId: string }) {
    return this.entitlementsService.getBillingSummary(user.userId);
  }

  @Get('account-usage')
  @UseGuards(CookieJwtGuard)
  accountUsage(@CurrentUser() user: { userId: string }) {
    return this.billingAccountService.getAccountUsage(user.userId);
  }

  @Get('purchases')
  @UseGuards(CookieJwtGuard)
  purchases(
    @CurrentUser() user: { userId: string },
    @Query() query: PurchaseHistoryQuery,
  ) {
    return this.billingAccountService.getPurchaseHistory(
      user.userId,
      query.page,
      query.pageSize,
    );
  }

  @Get('portal')
  @UseGuards(CookieJwtGuard)
  portal(@CurrentUser() user: { userId: string }) {
    return this.billingService.createPortal(user.userId);
  }

  @Post('checkout/oneshot')
  @UseGuards(CookieJwtGuard)
  checkoutOneshot(
    @CurrentUser() user: { userId: string },
    @Body() body: SingleDocumentCheckoutBody,
  ) {
    return this.billingService.createOneshotCheckout(user.userId, body);
  }

  @Post('checkout/single-document')
  @UseGuards(CookieJwtGuard)
  checkoutSingleDocument(
    @CurrentUser() user: { userId: string },
    @Body() body: SingleDocumentCheckoutBody,
  ) {
    return this.billingService.createOneshotCheckout(user.userId, body);
  }

  @Post('checkout/confirm')
  @UseGuards(CookieJwtGuard)
  confirmCheckout(
    @CurrentUser() user: { userId: string },
    @Body() body: ConfirmCheckoutBody,
  ) {
    return this.billingService.confirmCheckoutSession(
      user.userId,
      body.sessionId,
    );
  }

  @Post('checkout/business-pack')
  @UseGuards(CookieJwtGuard)
  checkoutBusinessPack(@CurrentUser() user: { userId: string }) {
    return this.billingService.createBusinessPackCheckout(user.userId);
  }

  @Post('checkout/subscription')
  @UseGuards(CookieJwtGuard)
  checkoutSubscription(@CurrentUser() user: { userId: string }) {
    return this.billingService.createSubscriptionCheckout(user.userId);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody =
      req.rawBody instanceof Buffer
        ? req.rawBody
        : Buffer.from(JSON.stringify(req.body ?? {}));
    return this.billingService.handleWebhook(signature, rawBody);
  }
}
