import { DocumentType } from '@prisma/client';
import { BASIC_DESIGN_PROMPT_RULES } from './basic-design.prompt';
import { DETAILED_DESIGN_PROMPT_RULES } from './detailed-design.prompt';
import { INTEGRATION_TEST_PROMPT_RULES } from './integration-test.prompt';
import { REQUIREMENTS_PROMPT_RULES } from './requirements.prompt';
import { UNIT_TEST_PROMPT_RULES } from './unit-test.prompt';

export const DOCUMENT_PROMPT_RULES: Record<DocumentType, string[]> = {
  REQUIREMENTS: REQUIREMENTS_PROMPT_RULES,
  BASIC_DESIGN: BASIC_DESIGN_PROMPT_RULES,
  DETAILED_DESIGN: DETAILED_DESIGN_PROMPT_RULES,
  UNIT_TEST: UNIT_TEST_PROMPT_RULES,
  INTEGRATION_TEST: INTEGRATION_TEST_PROMPT_RULES,
};
