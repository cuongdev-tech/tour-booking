import { prisma } from '../config/env.js';
import { AppError, toSafeUser } from '../utils/helpers.js';
import { comparePassword, hashPassword, signToken } from '../utils/auth.js';
import { createHash, randomBytes } from 'node:crypto';
import { isMailConfigured, passwordResetMail, resetLink, sendMail } from '../utils/mailer.js';

export async function register(data: { name: string; email: string; password: string; phone?: string }) {
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new AppError(409, 'Email already registered');

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: data.email.toLowerCase(),
      passwordHash: await hashPassword(data.password),
      phone: data.phone?.trim() || null,
    },
  });
  const token = signToken({ id: user.id, role: user.role });
  return { user: toSafeUser(user), token };
}

export async function login(data: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user) throw new AppError(401, 'Invalid email or password');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');

  const ok = await comparePassword(data.password, user.passwordHash);
  if (!ok) throw new AppError(401, 'Invalid email or password');

  const token = signToken({ id: user.id, role: user.role });
  return { user: toSafeUser(user), token };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  return toSafeUser(user);
}

export async function updateProfile(userId: string, data: { name?: string; phone?: string; avatar?: string }) {
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) throw new AppError(404, 'User not found');
  if (current.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name ? { name: data.name.trim() } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.avatar !== undefined ? { avatar: data.avatar || null } : {}),
    },
  });
  return toSafeUser(user);
}

const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function requestPasswordReset(email: string): Promise<{ sent: boolean }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always respond the same way: never reveal whether the email is registered.
  if (!user || !isMailConfigured()) return { sent: true };
  const token = randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashToken(token),
      passwordResetExpires: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  const { subject, text } = passwordResetMail(resetLink(token));
  await sendMail(user.email, subject, text);
  return { sent: true };
}

export async function resetPassword(token: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: hashToken(token), passwordResetExpires: { gt: new Date() } },
  });
  if (!user) throw new AppError(400, 'Reset link is invalid or expired');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });
  const freshToken = signToken({ id: updated.id, role: updated.role });
  return { user: toSafeUser(updated), token: freshToken };
}
