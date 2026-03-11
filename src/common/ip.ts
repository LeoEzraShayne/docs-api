import type { Request } from 'express';

export function getRequestIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');

  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }

  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
