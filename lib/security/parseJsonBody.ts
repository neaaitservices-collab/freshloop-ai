import { z, type ZodTypeAny } from 'zod';

export class InvalidJsonBodyError extends Error {
  constructor(message = 'Request body must be valid JSON.') {
    super(message);
    this.name = 'InvalidJsonBodyError';
  }
}

export async function parseJsonBody<T extends ZodTypeAny>(req: Request, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
  return schema.parse(raw);
}

export { z };
