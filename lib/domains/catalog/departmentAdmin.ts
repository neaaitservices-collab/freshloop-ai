import { z } from 'zod';
import { canEditDepartments, canViewDepartments } from '@/lib/auth/staffCapabilities';
import type { DepartmentRefRecord } from '@/lib/domains/catalog/departmentRef';
import type { RoleName } from '@/lib/utils/roles';

export class DepartmentAdminError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503
  ) {
    super(message);
    this.name = 'DepartmentAdminError';
  }
}

const CODE_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const CODE_MAX = 32;
const NAME_MAX = 80;

export const DEPARTMENT_TABLE_UNAVAILABLE =
  'Departments are not available on this database yet.';
export const DEPARTMENT_CODE_PERMANENT = 'Department code is permanent and cannot be changed.';
export const DEPARTMENT_CODE_TAKEN = 'A department with that code already exists.';
export const DEPARTMENT_NOT_DELETED =
  'Departments cannot be removed. Deactivate a department instead.';

export interface DepartmentAdminDb {
  ready(): Promise<boolean>;
  list(): Promise<DepartmentRefRecord[]>;
  insert(row: {
    code: string;
    name: string;
    active: boolean;
    sortOrder: number;
  }): Promise<DepartmentRefRecord>;
  update(
    id: string,
    data: { name?: string; active?: boolean }
  ): Promise<DepartmentRefRecord | null>;
}

export interface DepartmentAdminResult {
  status: number;
  body: {
    success: boolean;
    error?: string;
    departments?: DepartmentRefRecord[];
    department?: DepartmentRefRecord;
  };
}

const createSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(NAME_MAX),
  })
  .strict();

const patchSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    active: z.boolean().optional(),
    code: z.string().optional(),
  })
  .strict();

export function normalizeDepartmentCode(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toUpperCase();
  if (
    value.length < 1 ||
    value.length > CODE_MAX ||
    !CODE_PATTERN.test(value)
  ) {
    return {
      ok: false,
      error:
        'Code must be 1–32 characters, start with a letter, and use uppercase letters, numbers, and single underscores.',
    };
  }
  return { ok: true, value };
}

export function normalizeDepartmentName(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, error: 'Name is required.' };
  if (value.length > NAME_MAX) {
    return { ok: false, error: 'Name must be 80 characters or fewer.' };
  }
  return { ok: true, value };
}

/**
 * A matching code is ignored. Any other code is refused.
 * Callers must not write `code` on update.
 */
export function departmentCodeChangeError(currentCode: string, requested: string): string | null {
  const normalized = normalizeDepartmentCode(requested);
  if (!normalized.ok || normalized.value !== currentCode) return DEPARTMENT_CODE_PERMANENT;
  return null;
}

/** Fields that may be written. `code` is never included. */
export function departmentUpdateFields(input: {
  name?: string;
  active?: boolean;
}): { name?: string; active?: boolean } {
  const data: { name?: string; active?: boolean } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.active !== undefined) data.active = input.active;
  return data;
}

function invalidBody(error: z.ZodError): DepartmentAdminResult {
  const issue = error.issues[0];
  const message =
    issue?.code === 'unrecognized_keys' || !issue
      ? 'Invalid department request.'
      : issue.message;
  return { status: 400, body: { success: false, error: message } };
}

function denied(message: string, status: 401 | 403 | 405): DepartmentAdminResult {
  return { status, body: { success: false, error: message } };
}

export async function runDepartmentAdmin(input: {
  role: RoleName | null;
  method: string;
  body?: unknown;
  db: DepartmentAdminDb;
}): Promise<DepartmentAdminResult> {
  const method = input.method.toUpperCase();

  if (method === 'DELETE') {
    return denied(DEPARTMENT_NOT_DELETED, 405);
  }

  if (!input.role) {
    return denied('Unauthorized — sign in required.', 401);
  }

  if (method === 'GET') {
    if (!canViewDepartments(input.role)) {
      return denied('Forbidden — your role cannot view departments.', 403);
    }
    if (!(await input.db.ready())) {
      return { status: 503, body: { success: false, error: DEPARTMENT_TABLE_UNAVAILABLE } };
    }
    const departments = await input.db.list();
    return { status: 200, body: { success: true, departments } };
  }

  if (method !== 'POST' && method !== 'PATCH') {
    return denied('Method not allowed.', 405);
  }

  if (!canEditDepartments(input.role)) {
    return denied('Only an admin can change departments.', 403);
  }

  if (!(await input.db.ready())) {
    return { status: 503, body: { success: false, error: DEPARTMENT_TABLE_UNAVAILABLE } };
  }

  if (method === 'POST') {
    const parsed = createSchema.safeParse(input.body);
    if (!parsed.success) return invalidBody(parsed.error);
    const code = normalizeDepartmentCode(parsed.data.code);
    if (!code.ok) return { status: 400, body: { success: false, error: code.error } };
    const name = normalizeDepartmentName(parsed.data.name);
    if (!name.ok) return { status: 400, body: { success: false, error: name.error } };

    const existing = await input.db.list();
    if (existing.some((row) => row.code === code.value)) {
      return { status: 409, body: { success: false, error: DEPARTMENT_CODE_TAKEN } };
    }
    const sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), 0) + 10;
    try {
      const department = await input.db.insert({
        code: code.value,
        name: name.value,
        active: true,
        sortOrder,
      });
      return { status: 201, body: { success: true, department } };
    } catch (error) {
      if (error instanceof DepartmentAdminError) {
        return { status: error.status, body: { success: false, error: error.message } };
      }
      throw error;
    }
  }

  const parsed = patchSchema.safeParse(input.body);
  if (!parsed.success) return invalidBody(parsed.error);
  const current = (await input.db.list()).find((row) => row.id === parsed.data.id);
  if (!current) {
    return { status: 404, body: { success: false, error: 'Department was not found.' } };
  }
  if (parsed.data.code !== undefined) {
    const codeError = departmentCodeChangeError(current.code, parsed.data.code);
    if (codeError) return { status: 400, body: { success: false, error: codeError } };
  }

  let name: string | undefined;
  if (parsed.data.name !== undefined) {
    const normalized = normalizeDepartmentName(parsed.data.name);
    if (!normalized.ok) return { status: 400, body: { success: false, error: normalized.error } };
    name = normalized.value;
  }
  const data = departmentUpdateFields({ name, active: parsed.data.active });
  if (data.name === undefined && data.active === undefined) {
    return { status: 400, body: { success: false, error: 'A name or active flag is required.' } };
  }

  const department = await input.db.update(current.id, data);
  if (!department) {
    return { status: 404, body: { success: false, error: 'Department was not found.' } };
  }
  return { status: 200, body: { success: true, department } };
}
