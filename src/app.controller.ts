import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      ok: true,
      service: 'docs-api',
      deploymentProbe: 'github-actions-upload-test',
      timestamp: new Date().toISOString(),
    };
  }
}
