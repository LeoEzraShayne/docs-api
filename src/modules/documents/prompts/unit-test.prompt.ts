export const UNIT_TEST_PROMPT_RULES = [
  'Create a unit test specification from the detailed design or direct component list.',
  'Generate practical executable test cases for screen, API, and DB units according to selected viewpoints.',
  'Execution columns 実施者, 実施日, 備考 must be empty strings.',
  'Do not generate summary sheets, result-only sheets, integration scenarios, or external-system-only cases.',
  'Each test case must include clear preconditions, user/system steps, and expected results.',
];
