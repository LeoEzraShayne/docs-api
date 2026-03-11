import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [EntitlementsModule, AlertModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
