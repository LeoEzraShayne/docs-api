import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG } from '../documents/document-config';
import { DemoService } from './demo.service';

describe('DemoService', () => {
  it('returns a rate-limited formal requirements-v2 preview', async () => {
    const tabs = Object.fromEntries(
      DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map((sheet) => [
        sheet.name,
        [Object.fromEntries(sheet.columns.map((column) => [column, column]))],
      ]),
    );
    const prisma = {
      loginCode: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
      previewUsage: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
    };
    const generator = { generate: jest.fn().mockResolvedValue(tabs) };
    const service = new DemoService(prisma as never, generator as never);

    const response = await service.preview('203.0.113.10');

    expect(response.schema).toBe('requirements-v2');
    expect(Object.keys(response.tabs)).toEqual(
      DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map(
        (sheet) => sheet.name,
      ),
    );
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'demo' }),
      'standard',
    );
  });
});
