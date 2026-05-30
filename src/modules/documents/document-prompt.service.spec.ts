import { DocumentType } from '@prisma/client';
import { DocumentPromptService } from './document-prompt.service';

function createService() {
  const llm = {
    generateJson: jest.fn().mockResolvedValue({ sheets: {}, metadata: {} }),
  };
  return { service: new DocumentPromptService(llm as any), llm };
}

describe('DocumentPromptService', () => {
  it('uses requirement-specific business-level rules', async () => {
    const { service, llm } = createService();

    await service.generate(
      DocumentType.REQUIREMENTS,
      {
        project: { docTitle: '案件' },
        inputJson: {},
        source: null,
        selectedSheets: ['項目概要'],
      },
      'standard',
    );

    const messages = llm.generateJson.mock.calls[0][0];
    expect(messages[0].content).toContain('business perspective');
    expect(messages[0].content).toContain(
      'Do not create implementation details',
    );
  });

  it('uses integration-test scenario-chain rules', async () => {
    const { service, llm } = createService();

    await service.generate(
      DocumentType.INTEGRATION_TEST,
      {
        project: { docTitle: '案件' },
        inputJson: {},
        source: null,
        selectedSheets: ['業務シナリオテスト'],
      },
      'standard',
    );

    const messages = llm.generateJson.mock.calls[0][0];
    expect(messages[0].content).toContain('business scenario chains');
    expect(messages[0].content).toContain('Do not split external systems');
  });

  it.each([
    [DocumentType.BASIC_DESIGN, 'do not create detailed schemas'],
    [DocumentType.DETAILED_DESIGN, 'Do not output DDL'],
    [DocumentType.UNIT_TEST, 'Do not generate summary sheets'],
  ])('includes strict prompt rules for %s', async (type, expected) => {
    const { service, llm } = createService();

    await service.generate(
      type,
      {
        project: { docTitle: '案件' },
        inputJson: {},
        source: null,
        selectedSheets: ['存在しないシート'],
      },
      'standard',
    );

    const messages = llm.generateJson.mock.calls[0][0];
    expect(messages[0].content).toContain(expected);
    expect(messages[0].content).toContain(
      'exactly the required Japanese column names',
    );
  });
});
