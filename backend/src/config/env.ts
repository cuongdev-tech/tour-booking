import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export const env = {
  port: Number(process.env.PORT ?? 5000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // Demo bank account shown on the payment QR (VietQR). Replace with the real
  // shop account in production; never a secret, safe to expose.
  bankName: process.env.BANK_NAME?.trim() || 'MB',
  bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER?.trim() || '0123456789',
  bankAccountName: process.env.BANK_ACCOUNT_NAME?.trim() || 'TOUR BOOKING DEMO',
};

export const prisma = new PrismaClient();
