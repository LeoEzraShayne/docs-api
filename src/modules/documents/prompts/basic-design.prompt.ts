export const BASIC_DESIGN_PROMPT_RULES = [
  'Create a basic design document from the requirement definition or direct design input.',
  'Describe screen, function, API, database, authority, batch/report, and non-functional design at logical design level.',
  'API and DB sheets must remain design-level summaries; do not create detailed schemas, DDL, indexes, SQL, error-code tables, or request/response field lists.',
  'For データベース設計, always fill テーブル物理名 with a stable snake_case physical table name such as users or measurement_data.',
  'Screen transition, screen design, and function design rows should be concrete enough for detailed design but must not become implementation tasks.',
  'Use upstream requirement terminology consistently and leave uncertain physical details blank.',
];
