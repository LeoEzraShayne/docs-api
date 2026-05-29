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
import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { CookieJwtGuard } from '../../common/cookie-jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { RequestWithMeta } from '../../common/request-id.middleware';
import { DocumentsService } from './documents.service';

const SOURCE_TYPES = [
  'PROJECT',
  'REQUIREMENTS_VERSION',
  'BASIC_DESIGN_VERSION',
  'DETAILED_DESIGN_VERSION',
  'DIRECT_INPUT',
  'PASTED_DESIGN',
] as const;

class GenerateDocumentDto {
  @IsOptional()
  @IsIn(SOURCE_TYPES)
  sourceType?: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsString()
  sourceDocumentVersionId?: string;

  @IsOptional()
  @IsObject()
  inputJson?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['standard', 'simple', 'custom'])
  generationMode?: 'standard' | 'simple' | 'custom';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedSheets?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testViewpoints?: string[];

  @IsOptional()
  @IsIn(['standard', 'high'])
  quality?: 'standard' | 'high';
}

@Controller('projects/:projectId/documents')
@UseGuards(CookieJwtGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Param('projectId') projectId: string,
  ) {
    return this.documents.list(user.userId, projectId);
  }

  @Get('tree')
  tree(
    @CurrentUser() user: { userId: string },
    @Param('projectId') projectId: string,
  ) {
    return this.documents.tree(user.userId, projectId);
  }

  @Get(':type')
  get(
    @CurrentUser() user: { userId: string },
    @Param('projectId') projectId: string,
    @Param('type') type: string,
  ) {
    return this.documents.get(user.userId, projectId, type);
  }

  @Post(':type/generate')
  generate(
    @CurrentUser() user: { userId: string },
    @Param('projectId') projectId: string,
    @Param('type') type: string,
    @Body() body: GenerateDocumentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithMeta,
  ) {
    return this.documents.generate(user.userId, projectId, type, {
      ...body,
      idempotencyKey,
      requestId: req.requestId,
    });
  }

  @Get(':type/versions/:versionNo/download')
  async download(
    @CurrentUser() user: { userId: string },
    @Param('projectId') projectId: string,
    @Param('type') type: string,
    @Param('versionNo') versionNo: string,
    @Req() req: RequestWithMeta,
    @Res() res: Response,
  ) {
    const file = await this.documents.download(
      user.userId,
      projectId,
      type,
      Number(versionNo),
      req.requestId,
    );
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(file.buffer);
  }
}
