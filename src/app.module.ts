import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AlertModule } from './modules/alert/alert.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { DemoModule } from './modules/demo/demo.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { GenerateModule } from './modules/generate/generate.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
    }),
    ScheduleModule.forRoot(),
    JwtModule.register({ global: true }),
    PrismaModule,
    UsersModule,
    EntitlementsModule,
    AlertModule,
    AuthModule,
    ProjectsModule,
    GenerateModule,
    BillingModule,
    DemoModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
