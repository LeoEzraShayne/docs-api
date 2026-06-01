export const INTEGRATION_TEST_PROMPT_RULES = [
  'Create an integration test specification as business scenario chains.',
  'Each row should combine multiple related functions into one end-to-end scenario.',
  'Do not split external systems into separate sheets. Execution columns 実施者, 実施日, 備考 must be empty strings.',
  'Scenarios must be business-flow oriented and may mention external systems only inside the single scenario sheet.',
  'Do not generate unit-level tests, isolated API tests, isolated DB tests, or separate external integration sheets.',
];
