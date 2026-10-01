import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const rawJwtSecret = process.env.JWT_SECRET;
// A public fallback secret means forged sessions for every role — refuse to
// boot production without a real one (dev keeps working out of the box).
if ((!rawJwtSecret || rawJwtSecret === 'dev-secret-change-me') && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set to a strong random value in production');
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  isProduction: process.env.NODE_ENV === 'production',
  // Number of trusted reverse-proxy hops in front of the app (rate-limit IP).
  // Keep 0 (direct) unless deployed behind a proxy you control — trusting
  // client-sent X-Forwarded-For would let attackers spoof req.ip.
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  jwtSecret: rawJwtSecret ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // Extra allowed origins (comma-separated) for production deployments.
  extraOrigins: (process.env.FRONTEND_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Demo bank account shown on the payment QR (VietQR). Replace with the real
  // shop account in production; never a secret, safe to expose.
  bankName: process.env.BANK_NAME?.trim() || 'MB',
  bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER?.trim() || '0123456789',
  bankAccountName: process.env.BANK_ACCOUNT_NAME?.trim() || 'TOUR BOOKING DEMO',
};

export const prisma = new PrismaClient();
