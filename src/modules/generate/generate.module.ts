import { Module } from '@nestjs/common';
import { AlertModule } from '../alert/alert.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ProjectsModule } from '../projects/projects.module';
import { GenerateController } from './generate.controller';
import { ExcelService } from './excel.service';
import { GenerateService } from './generate.service';
import { LlmService } from './llm.service';

@Module({
  imports: [ProjectsModule, EntitlementsModule, AlertModule],
  controllers: [GenerateController],
  providers: [GenerateService, LlmService, ExcelService],
  exports: [GenerateService, ExcelService, LlmService],
})
export class GenerateModule {}
