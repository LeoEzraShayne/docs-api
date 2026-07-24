import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [DocumentsModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
