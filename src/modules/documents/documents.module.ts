import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ExcelService } from '../generate/excel.service';
import { LlmService } from '../generate/llm.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentCatalogController } from './document-catalog.controller';
import { DocumentGrantsService } from './document-grants.service';
import { DocumentPromptService } from './document-prompt.service';
import { DocumentsService } from './documents.service';
import { RequirementsPreviewGeneratorService } from './requirements-preview-generator.service';

@Module({
  imports: [PrismaModule, EntitlementsModule, AlertModule],
  controllers: [DocumentsController, DocumentCatalogController],
  providers: [
    DocumentsService,
    DocumentGrantsService,
    DocumentPromptService,
    RequirementsPreviewGeneratorService,
    LlmService,
    ExcelService,
  ],
  exports: [DocumentsService, RequirementsPreviewGeneratorService],
})
export class DocumentsModule {}
