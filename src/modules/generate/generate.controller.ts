import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { CookieJwtGuard } from '../../common/cookie-jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { getRequestIp } from '../../common/ip';
import type { RequestWithMeta } from '../../common/request-id.middleware';
import { GenerateService } from './generate.service';

class GenerateDto {
  @IsIn(['preview', 'export'])
  mode!: 'preview' | 'export';

  @IsIn(['standard', 'high'])
  quality!: 'standard' | 'high';
}

@Controller('projects/:id')
@UseGuards(CookieJwtGuard)
export class GenerateController {
  constructor(private readonly generateService: GenerateService) {}

  @Post('generate')
  generate(
    @CurrentUser() user: { userId: string },
    @Param('id') projectId: string,
    @Body() body: GenerateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithMeta,
  ) {
    return this.generateService.generate(user.userId, projectId, {
      ...body,
      idempotencyKey,
      ip: getRequestIp(req),
      requestId: req.requestId,
    });
  }

  @Get('versions/:ver/download')
  async download(
    @CurrentUser() user: { userId: string },
    @Param('id') projectId: string,
    @Param('ver') versionNo: string,
    @Req() req: RequestWithMeta,
    @Res() res: Response,
  ) {
    const file = await this.generateService.downloadVersion(
      user.userId,
      projectId,
      Number(versionNo),
      req,
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.send(file.buffer);
  }
}
