import type { DefaultSession } from 'next-auth';
import type { RoleName } from '@/lib/utils/roles';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: RoleName;
      position: string;
    } & DefaultSession['user'];
  }

  interface User {
    role: RoleName;
    position: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: RoleName;
    position?: string;
  }
}
