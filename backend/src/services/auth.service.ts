import { env, prisma } from '../config/env.js';
import { AppError, normalizeEmail, toSafeUser } from '../utils/helpers.js';
import { comparePassword, hashPassword, signToken } from '../utils/auth.js';
import { createHash, randomBytes } from 'node:crypto';
import { isMailConfigured, passwordResetMail, resetLink, sendMail, verificationMail, verifyEmailLink } from '../utils/mailer.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

async function sendVerificationMail(userId: string, email: string): Promise<string | null> {
  const token = randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifyToken: hashToken(token),
      emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });
  const { subject, text } = verificationMail(verifyEmailLink(token));
  await sendMail(email, subject, text);
  return token;
}

export async function register(data: { name: string; email: string; password: string; phone?: string; referralCode?: string }) {
  const email = normalizeEmail(data.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  // Anti-enumeration without email verification would leak via 409.
  // With verification, 409 is acceptable (address is confirmed by inbox
  // ownership), but keep the message generic.
  if (existing) throw new AppError(409, 'Unable to register with this email');

  const mailOn = isMailConfigured();
  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      passwordHash: await hashPassword(data.password),
      phone: data.phone?.trim() || null,
      // Never auto-verify in production: a misconfigured SMTP must not
      // bypass verification. Dev (non-prod) keeps auto-verify convenience.
      emailVerified: false,
    },
  });
  let mailDisabled = false;
  if (mailOn) {
    try {
      await sendVerificationMail(user.id, email);
    } catch (err) {
      console.error('verification mail failed:', err);
    }
  } else {
    mailDisabled = true;
    // Dev convenience only: auto-verify when mail is off outside production.
    if (!env.isProduction) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    }
  }
  // Referral is best-effort (invalid code never blocks signup).
  try {
    const { applyReferral, ensureReferralCode } = await import('./loyalty.service.js');
    await ensureReferralCode(user.id);
    await applyReferral(user.id, data.referralCode);
  } catch (err) {
    console.error('referral failed:', err);
  }
  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  const token = signToken({ id: user.id, role: user.role, tv: user.tokenVersion ?? 0 });
  return { user: toSafeUser(fresh ?? user), token, mailDisabled };
}

export async function login(data: { email: string; password: string }) {
  const email = normalizeEmail(data.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(401, 'Invalid email or password');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');

  const ok = await comparePassword(data.password, user.passwordHash);
  if (!ok) throw new AppError(401, 'Invalid email or password');

  const token = signToken({ id: user.id, role: user.role, tv: user.tokenVersion ?? 0 });
  return { user: toSafeUser(user), token };
}

export async function getMe(userId: string, tokenTv?: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  if (tokenTv !== undefined && (user.tokenVersion ?? 0) !== tokenTv) {
    throw new AppError(401, 'Token expired or invalid');
  }
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

export async function requestPasswordReset(emailRaw: string): Promise<{ sent: boolean; mailDisabled?: boolean }> {
  const email = normalizeEmail(emailRaw);
  const user = await prisma.user.findUnique({ where: { email } });
  // Always respond the same way: never reveal whether the email is registered.
  // When SMTP isn't configured no mail can go out — flag it so the UI can say
  // so instead of leaving the user waiting for a mail that never comes.
  if (!isMailConfigured()) return { sent: true, mailDisabled: true };
  if (!user) return { sent: true };
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
      tokenVersion: { increment: 1 },
    },
  });
  const freshToken = signToken({ id: updated.id, role: updated.role, tv: updated.tokenVersion ?? 0 });
  return { user: toSafeUser(updated), token: freshToken };
}

export async function refreshToken(userId: string, tokenTv?: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(401, 'Token expired or invalid');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled');
  if (tokenTv !== undefined && (user.tokenVersion ?? 0) !== tokenTv) {
    throw new AppError(401, 'Token expired or invalid');
  }
  const token = signToken({ id: user.id, role: user.role, tv: user.tokenVersion ?? 0 });
  return { user: toSafeUser(user), token };
}

export async function verifyEmail(token: string) {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: hashToken(token), emailVerifyExpires: { gt: new Date() } },
  });
  if (!user) throw new AppError(400, 'Verification link is invalid or expired');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
  });
  return { user: toSafeUser(updated) };
}

export async function resendVerification(emailRaw: string): Promise<{ sent: boolean; mailDisabled?: boolean }> {
  const email = normalizeEmail(emailRaw);
  // Always respond the same way: never reveal whether the email exists or is
  // already verified.
  if (!isMailConfigured()) return { sent: true, mailDisabled: true };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return { sent: true };
  try {
    await sendVerificationMail(user.id, user.email);
  } catch (err) {
    console.error('verification mail failed:', err);
  }
  return { sent: true };
}
