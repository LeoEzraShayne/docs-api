import { Controller, Get, Header } from '@nestjs/common';
import { buildDocumentCatalogV1 } from './document-catalog';

@Controller('document-catalog')
export class DocumentCatalogController {
  @Get('v1')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=3600')
  getV1() {
    return buildDocumentCatalogV1();
  }
}
