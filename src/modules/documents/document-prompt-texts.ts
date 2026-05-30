import { DocumentType } from '@prisma/client';

export const DOCUMENT_PROMPT_RULES: Record<DocumentType, string[]> = {
  REQUIREMENTS: [
    'Create a requirement definition document from the business perspective.',
    'Describe what the system must achieve, target users, scope, business rules, and risks.',
    'Do not create implementation details such as URLs, JSON, DB column types, indexes, SQL, or source-code logic.',
    'API rows are requirement-level external/internal interaction needs only; no endpoints, methods, payload schema, or status codes.',
    'Screen, data, permission, flow, and non-functional rows must describe business needs and acceptance-level intent.',
  ],
  BASIC_DESIGN: [
    'Create a basic design document from the requirement definition or direct design input.',
    'Describe screen, function, API, database, authority, batch/report, and non-functional design at logical design level.',
    'API and DB sheets must remain design-level summaries; do not create detailed schemas, DDL, indexes, SQL, error-code tables, or request/response field lists.',
    'Screen transition, screen design, and function design rows should be concrete enough for detailed design but must not become implementation tasks.',
    'Use upstream requirement terminology consistently and leave uncertain physical details blank.',
  ],
  DETAILED_DESIGN: [
    'Create a detailed design document that engineers can implement from.',
    'Include table fields, API items, request/response JSON summaries, screen items, validation checks, screen actions, errors, and messages.',
    'Use concrete names and values when the source supports them, and leave unknown values blank instead of inventing incompatible behavior.',
    'Do not output DDL, SQL, source code, framework-specific code, or unrelated infrastructure configuration.',
    'Validation, error, and message rows must map to concrete screen/API/table behavior.',
  ],
  UNIT_TEST: [
    'Create a unit test specification from the detailed design or direct component list.',
    'Generate practical executable test cases for screen, API, and DB units according to selected viewpoints.',
    'Execution columns 実施者, 実施日, 備考 must be empty strings.',
    'Do not generate summary sheets, result-only sheets, integration scenarios, or external-system-only cases.',
    'Each test case must include clear preconditions, user/system steps, and expected results.',
  ],
  INTEGRATION_TEST: [
    'Create an integration test specification as business scenario chains.',
    'Each row should combine multiple related functions into one end-to-end scenario.',
    'Do not split external systems into separate sheets. Execution columns 実施者, 実施日, 備考 must be empty strings.',
    'Scenarios must be business-flow oriented and may mention external systems only inside the single scenario sheet.',
    'Do not generate unit-level tests, isolated API tests, isolated DB tests, or separate external integration sheets.',
  ],
};
