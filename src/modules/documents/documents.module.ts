import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ExcelService } from '../generate/excel.service';
import { LlmService } from '../generate/llm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentGrantsService } from './document-grants.service';
import { DocumentsService } from './documents.service';

@Module({
  imports: [PrismaModule, EntitlementsModule, AlertModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentGrantsService, LlmService, ExcelService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
