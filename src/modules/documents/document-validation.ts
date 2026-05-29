import { BadRequestException } from '@nestjs/common';
import { DocumentSourceType, DocumentType } from '@prisma/client';
import { DOCUMENT_CONFIG, parseDocumentType } from './document-config';
import { GenerateInput } from './document-generate.types';
import { selectSheets } from './document-output';

export function requireDocumentType(value: string) {
  const type = parseDocumentType(value);
  if (!type) throw new BadRequestException('Invalid document type');
  return type;
}

export function validateGenerateInput(
  type: DocumentType,
  sourceType: DocumentSourceType,
  input: GenerateInput,
) {
  if (!DOCUMENT_CONFIG[type].sources.includes(sourceType)) {
    throw new BadRequestException('Invalid source type');
  }

  const limit =
    type === 'INTEGRATION_TEST' && sourceType === 'PASTED_DESIGN'
      ? 10_000
      : 20_000;
  if (JSON.stringify(input.inputJson ?? {}).length > limit) {
    throw new BadRequestException('Input exceeds maximum length');
  }
  selectSheets(type, input.generationMode, input.selectedSheets);
}

export function validateDocumentCooldown(lastGenerateAt: Date | null) {
  if (lastGenerateAt && Date.now() - lastGenerateAt.getTime() < 30_000) {
    throw new BadRequestException('Generate cooldown: 30 seconds');
  }
}
