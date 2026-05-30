import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import ExcelJS from 'exceljs';
import { DocumentType } from '@prisma/client';
import { AlertService } from '../alert/alert.service';
import { DOCUMENT_CONFIG } from '../documents/document-config';

@Injectable()
export class ExcelService {
  constructor(
    private readonly configService: ConfigService,
    private readonly alertService: AlertService,
  ) {}

  async generateWorkbook(payload: {
    docTitle: string;
    extractedJson: Record<string, Record<string, unknown>[]>;
    requestId?: string;
    documentType?: DocumentType;
  }) {
    const workerUrl = this.configService.get<string>('EXCEL_WORKER_URL');

    if (workerUrl) {
      try {
        const response = await fetch(
          `${workerUrl.replace(/\/$/, '')}/generate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-request-id': payload.requestId ?? '',
            },
            body: JSON.stringify({
              docTitle: payload.docTitle,
              sheets: payload.extractedJson,
              extractedJson: payload.extractedJson,
              documentType: payload.documentType,
              templateVersion: 'v2',
            }),
          },
        );

        if (!response.ok) {
          throw new Error(`excel-worker ${response.status}`);
        }

        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        await this.alertService.recordConsecutiveFailure(
          'excelWorker',
          payload.requestId ? [payload.requestId] : [],
          error instanceof Error ? error.message : 'excel worker error',
        );
        throw new ServiceUnavailableException('Excel worker unavailable');
      }
    }

    const workbook = new ExcelJS.Workbook();
    const entries = this.orderedEntries(payload);
    for (const [sheetName, rows, columns] of entries) {
      const sheet = workbook.addWorksheet(this.safeSheetName(sheetName));
      let excelColumns = columns.map((key) => ({ header: key, key }));

      if (excelColumns.length === 0) {
        excelColumns = [{ header: 'message', key: 'message' }];
      }

      sheet.columns = excelColumns;
      if (rows.length === 0) {
        sheet.addRow({ message: 'No data' });
      } else {
        rows.forEach((row) => sheet.addRow(row));
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    await this.alertService.resetFailures('excelWorker');
    return Buffer.from(buffer);
  }

  private orderedEntries(payload: {
    extractedJson: Record<string, Record<string, unknown>[]>;
    documentType?: DocumentType;
  }): Array<[string, Record<string, unknown>[], string[]]> {
    if (!payload.documentType) {
      return Object.entries(payload.extractedJson).map(([name, rows]) => [
        name,
        rows,
        Array.from(new Set(rows.flatMap((row) => Object.keys(row)))),
      ]);
    }

    return DOCUMENT_CONFIG[payload.documentType].sheets
      .filter((sheet) => payload.extractedJson[sheet.name])
      .map((sheet) => [
        sheet.name,
        payload.extractedJson[sheet.name] ?? [],
        sheet.columns,
      ]);
  }

  private safeSheetName(name: string) {
    return name.replace(/[*?:\\/[\]]/g, '・').slice(0, 31);
  }

  async pingWorker() {
    const workerUrl = this.configService.get<string>('EXCEL_WORKER_URL');
    if (!workerUrl) {
      return true;
    }

    try {
      const response = await fetch(`${workerUrl.replace(/\/$/, '')}/health`);
      if (!response.ok) {
        throw new Error(`health ${response.status}`);
      }
      await this.alertService.resetFailures('excelWorker');
      return true;
    } catch (error) {
      await this.alertService.recordConsecutiveFailure(
        'excelWorker',
        [],
        error instanceof Error ? error.message : 'worker health failed',
      );
      return false;
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async healthCheck() {
    await this.pingWorker();
  }
}
