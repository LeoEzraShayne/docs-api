import { Injectable } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { sheetNames } from './document-config';
import { normalizeDocumentOutput } from './document-output';
import { DocumentPromptService } from './document-prompt.service';

type RequirementsProjectInput = {
  id?: string;
  docTitle?: string | null;
  formFields?: Record<string, unknown> | null;
  minutesText?: string | null;
};

@Injectable()
export class RequirementsPreviewGeneratorService {
  constructor(private readonly prompts: DocumentPromptService) {}

  async generate(
    project: RequirementsProjectInput,
    quality: 'standard' | 'high',
  ) {
    const selectedSheets = sheetNames(DocumentType.REQUIREMENTS);
    const raw = await this.prompts.generate(
      DocumentType.REQUIREMENTS,
      {
        project: {
          id: project.id ?? '',
          docTitle: project.docTitle ?? '要件定義書',
          formFields: project.formFields ?? {},
        },
        inputJson: project.formFields ?? {},
        source: { minutesText: project.minutesText ?? '' },
        selectedSheets,
      },
      quality,
    );

    return normalizeDocumentOutput(
      DocumentType.REQUIREMENTS,
      selectedSheets,
      raw,
    ).sheets;
  }
}
