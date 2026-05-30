import { DocumentType } from '@prisma/client';

export const DOCUMENT_PROMPT_RULES: Record<DocumentType, string[]> = {
  REQUIREMENTS: [
    'Create a requirement definition document from the business perspective.',
    'Describe what the system must achieve, target users, scope, business rules, and risks.',
    'Do not create implementation details such as URLs, JSON, DB column types, indexes, SQL, or source-code logic.',
  ],
  BASIC_DESIGN: [
    'Create a basic design document from the requirement definition or direct design input.',
    'Describe screen, function, API, database, authority, batch/report, and non-functional design at logical design level.',
    'API and DB sheets must remain design-level summaries; do not create detailed schemas, DDL, indexes, SQL, error-code tables, or request/response field lists.',
  ],
  DETAILED_DESIGN: [
    'Create a detailed design document that engineers can implement from.',
    'Include table fields, API items, request/response JSON summaries, screen items, validation checks, screen actions, errors, and messages.',
    'Use concrete names and values when the source supports them, and leave unknown values blank instead of inventing incompatible behavior.',
  ],
  UNIT_TEST: [
    'Create a unit test specification from the detailed design or direct component list.',
    'Generate practical executable test cases for screen, API, and DB units according to selected viewpoints.',
    'Execution columns 実施者, 実施日, 備考 must be empty strings.',
  ],
  INTEGRATION_TEST: [
    'Create an integration test specification as business scenario chains.',
    'Each row should combine multiple related functions into one end-to-end scenario.',
    'Do not split external systems into separate sheets. Execution columns 実施者, 実施日, 備考 must be empty strings.',
  ],
};
