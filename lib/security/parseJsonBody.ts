import { z, type ZodType } from 'zod';

export class InvalidJsonBodyError extends Error {
  constructor(message = 'Request body must be valid JSON.') {
    super(message);
    this.name = 'InvalidJsonBodyError';
  }
}

export async function parseJsonBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
  return schema.parse(raw);
}

export { z };
