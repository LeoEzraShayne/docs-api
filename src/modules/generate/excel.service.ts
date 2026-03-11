import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import ExcelJS from 'exceljs';
import { AlertService } from '../alert/alert.service';

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
  }) {
    const workerUrl = this.configService.get<string>('EXCEL_WORKER_URL');

    if (workerUrl) {
      try {
        const response = await fetch(`${workerUrl.replace(/\/$/, '')}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': payload.requestId ?? '',
          },
          body: JSON.stringify({
            docTitle: payload.docTitle,
            extractedJson: payload.extractedJson,
            templateVersion: 'v2',
          }),
        });

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
    for (const [sheetName, rows] of Object.entries(payload.extractedJson)) {
      const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
      const columns = Array.from(
        new Set(rows.flatMap((row) => Object.keys(row))),
      ).map((key) => ({ header: key, key }));

      if (columns.length === 0) {
        columns.push({ header: 'message', key: 'message' });
      }

      sheet.columns = columns;
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
