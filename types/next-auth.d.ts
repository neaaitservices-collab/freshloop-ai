import type { DefaultSession } from 'next-auth';
import type { RoleName } from '@/lib/utils/roles';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: RoleName;
      position: string;
      hourlyRate: number | null;
    } & DefaultSession['user'];
    /** Database lookup failed while refreshing this session. Do not authorize. */
    staffLookupFailed?: boolean;
  }

  interface User {
    role: RoleName;
    position: string;
    hourlyRate?: number | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: RoleName;
    position?: string;
    hourlyRate?: number | null;
    /** Set when the staff row is missing, has no password, or the lookup failed. */
    revoked?: boolean;
    /** Staff lookup threw. The previous role must not be kept. */
    lookupFailed?: boolean;
  }
}
