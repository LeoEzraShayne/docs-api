import ExcelJS from 'exceljs';
import { DocumentType } from '@prisma/client';
import { ExcelService } from './excel.service';

function createService(workerUrl?: string) {
  const config = { get: jest.fn().mockReturnValue(workerUrl) };
  const alert = {
    recordConsecutiveFailure: jest.fn(),
    resetFailures: jest.fn(),
  };
  return { service: new ExcelService(config as any, alert as any), alert };
}

describe('ExcelService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses configured sheet order and columns for document workbooks', async () => {
    const { service } = createService();
    const buffer = await service.generateWorkbook({
      docTitle: '案件',
      documentType: DocumentType.INTEGRATION_TEST,
      extractedJson: {
        業務シナリオテスト: [
          {
            No: 1,
            シナリオ名: '登録から確認まで',
            関連機能: '登録, 確認',
          },
        ],
      },
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

    expect(workbook.worksheets.map((item) => item.name)).toEqual([
      '業務シナリオテスト',
    ]);
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'No',
      'シナリオ名',
      '関連機能',
      '前提条件',
      'テスト手順',
      '期待結果',
      '実施者',
      '実施日',
      '備考',
    ]);
  });

  it('sends strict sheets payload to an Excel worker', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);
    const { service } = createService('https://excel.example');

    await service.generateWorkbook({
      docTitle: '案件',
      documentType: DocumentType.REQUIREMENTS,
      requestId: 'req-1',
      extractedJson: { 項目概要: [{ No: 1, 項目: '目的', 内容: '内容' }] },
    });

    const requestBody = fetchMock.mock.calls[0][1]?.body;
    expect(typeof requestBody).toBe('string');
    if (typeof requestBody !== 'string') {
      throw new Error('Excel worker request body must be JSON text');
    }
    const body = JSON.parse(requestBody);
    expect(fetchMock.mock.calls[0][0]).toBe('https://excel.example/generate');
    expect(body).toMatchObject({
      docTitle: '案件',
      documentType: DocumentType.REQUIREMENTS,
      templateVersion: 'v2',
      sheets: { 項目概要: [{ No: 1, 項目: '目的', 内容: '内容' }] },
    });
  });
});
