export const DETAILED_DESIGN_PROMPT_RULES = [
  'Create a detailed design document that engineers can implement from.',
  'Include table fields, API items, request/response JSON summaries, screen items, validation checks, screen actions, errors, and messages.',
  'For テーブル詳細設計 and テーブル項目定義, always fill テーブル物理名 with the same stable snake_case table name for the same logical table.',
  'Use concrete names and values when the source supports them, and leave unknown values blank instead of inventing incompatible behavior.',
  'Do not output DDL, SQL, source code, framework-specific code, or unrelated infrastructure configuration.',
  'Validation, error, and message rows must map to concrete screen/API/table behavior.',
];
