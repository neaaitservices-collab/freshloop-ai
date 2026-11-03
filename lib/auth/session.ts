import { auth } from '@/auth';
import type { RoleName } from '@/lib/utils/roles';
import { isRoleName } from '@/lib/utils/roles';

export type AuthSessionUser = {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  position: string;
  hourlyRate: number | null;
};

export async function getSessionUser(): Promise<AuthSessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  const role = user.role && isRoleName(user.role) ? user.role : null;
  if (!role) return null;
  const sessionRate = user.hourlyRate;
  const hourlyRate =
    typeof sessionRate === 'number' && Number.isFinite(sessionRate) && sessionRate > 0
      ? sessionRate
      : null;

  return {
    id: user.id,
    name: user.name ?? '',
    email: user.email,
    role,
    position: user.position ?? '',
    hourlyRate,
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function requireSessionUser(): Promise<AuthSessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError('Unauthorized — sign in required.', 401);
  }
  return user;
}

export async function requireRoles(allowed: RoleName[]): Promise<AuthSessionUser> {
  const user = await requireSessionUser();
  if (!allowed.includes(user.role)) {
    throw new AuthError('Forbidden — your role cannot perform this action.', 403);
  }
  return user;
}
