import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    const body = JSON.parse(response.text) as {
      ok: boolean;
      service: string;
      deploymentProbe: string;
      timestamp: string;
    };
    expect(body).toMatchObject({
      ok: true,
      service: 'docs-api',
      deploymentProbe: 'github-actions-upload-test',
    });
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('/document-catalog/v1 (GET) is public and cacheable', async () => {
    const response = await request(app.getHttpServer())
      .get('/document-catalog/v1')
      .expect(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=300, s-maxage=3600',
    );
    const body = JSON.parse(response.text) as {
      contractVersion: number;
      contractHash: string;
      documents: { REQUIREMENTS: { sheets: unknown[] } };
    };
    expect(body.contractVersion).toBe(1);
    expect(body.contractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.documents.REQUIREMENTS.sheets).toHaveLength(12);
  });
});
