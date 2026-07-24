import { DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG } from './document-config';
import { RequirementsPreviewGeneratorService } from './requirements-preview-generator.service';

describe('RequirementsPreviewGeneratorService', () => {
  it('generates and normalizes all 12 official requirements sheets', async () => {
    const sheets = Object.fromEntries(
      DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets.map((sheet) => [
        sheet.name,
        [
          Object.fromEntries(
            sheet.columns.map((column) => [column, `${sheet.name}-${column}`]),
          ),
        ],
      ]),
    );
    const prompts = {
      generate: jest.fn().mockResolvedValue({ sheets, metadata: {} }),
    };
    const service = new RequirementsPreviewGeneratorService(prompts as never);

    const result = await service.generate(
      {
        id: 'project-1',
        docTitle: '案件',
        formFields: { purpose: '受注管理' },
        minutesText: '受注と請求を一元管理する',
      },
      'standard',
    );

    const specs = DOCUMENT_CONFIG[DocumentType.REQUIREMENTS].sheets;
    expect(Object.keys(result)).toEqual(specs.map((sheet) => sheet.name));
    for (const spec of specs) {
      expect(Object.keys(result[spec.name][0])).toEqual(spec.columns);
    }
    expect(prompts.generate).toHaveBeenCalledWith(
      DocumentType.REQUIREMENTS,
      expect.objectContaining({
        selectedSheets: specs.map((sheet) => sheet.name),
      }),
      'standard',
    );
  });
});
