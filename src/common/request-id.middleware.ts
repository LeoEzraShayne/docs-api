import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithMeta = Request & {
  requestId?: string;
  user?: {
    userId: string;
    email: string;
  };
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithMeta, res: Response, next: NextFunction) {
    req.requestId = req.header('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  }
}
