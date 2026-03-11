import { Module } from '@nestjs/common';
import { GenerateModule } from '../generate/generate.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [GenerateModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
