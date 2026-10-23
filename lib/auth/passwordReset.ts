import crypto from 'crypto';
import { prisma } from '@/lib/domains/inventory/ledger';
import { hashPassword } from '@/lib/auth/password';

const RESET_PREFIX = 'password-reset:';
const RESET_TTL_MS = 60 * 60 * 1000;

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function resetIdentifier(email: string): string {
  return `${RESET_PREFIX}${email.trim().toLowerCase()}`;
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return null;

  const token = generateResetToken();
  const identifier = resetIdentifier(normalized);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashResetToken(token),
      expires: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  return token;
}

export async function resetPasswordWithToken(input: {
  email: string;
  token: string;
  newPassword: string;
}): Promise<boolean> {
  const normalized = input.email.trim().toLowerCase();
  const identifier = resetIdentifier(normalized);
  const hashed = hashResetToken(input.token.trim());

  const row = await prisma.verificationToken.findFirst({
    where: { identifier, token: hashed },
  });

  if (!row || row.expires < new Date()) {
    if (row) {
      await prisma.verificationToken.deleteMany({ where: { identifier } });
    }
    return false;
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({
    where: { email: normalized },
    data: { passwordHash },
  });
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  return true;
}

export function passwordResetUrl(email: string, token: string): string {
  const base =
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000';
  const params = new URLSearchParams({
    email,
    token,
  });
  return `${base.replace(/\/$/, '')}/reset-password?${params.toString()}`;
}
