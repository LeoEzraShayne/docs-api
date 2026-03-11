import { Controller, Post, Req } from '@nestjs/common';
import { getRequestIp } from '../../common/ip';
import type { RequestWithMeta } from '../../common/request-id.middleware';
import { DemoService } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('preview')
  preview(@Req() req: RequestWithMeta) {
    return this.demoService.preview(getRequestIp(req));
  }
}
