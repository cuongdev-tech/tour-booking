import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** SMTP settings from env. Absent => password reset (and any future mail) is disabled. */
export function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    pass,
    from: process.env.SMTP_FROM ?? `Tour Booking <${user}>`,
  };
}

export const isMailConfigured = (): boolean => getMailConfig() !== null;

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const transporter = getTransporter();
  const cfg = getMailConfig();
  await transporter.sendMail({ from: cfg!.from, to, subject, text });
}

// One cached transporter (recreated when SMTP settings change) instead of a
// new TCP connection per email.
let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;
let cachedKey = '';
function getTransporter(): ReturnType<typeof nodemailer.createTransport> {
  const cfg = getMailConfig();
  if (!cfg) throw new Error('Email is not configured');
  const key = JSON.stringify(cfg);
  if (!cachedTransporter || cachedKey !== key) {
    cachedTransporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    cachedKey = key;
  }
  return cachedTransporter;
}

export function passwordResetMail(resetUrl: string): { subject: string; text: string } {
  return {
    subject: 'Reset your Tour Booking password',
    text: [
      'You requested a password reset for your Tour Booking account.',
      '',
      `Reset link (valid for 1 hour): ${resetUrl}`,
      '',
      'If you did not request this, ignore this email.',
    ].join('\n'),
  };
}

export function resetLink(token: string): string {
  return `${env.frontendUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
}

export function bookingLink(code: string): string {
  return `${env.frontendUrl.replace(/\/$/, '')}/booking-success/${code}`;
}

/** Public ticket verification page (QR target, no login required). */
export function verifyLink(code: string): string {
  return `${env.frontendUrl.replace(/\/$/, '')}/verify/${code}`;
}

function vnd(amount: number): string {
  return `${Number(amount).toLocaleString('vi-VN')}₫`;
}

function viDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  // Pin Vietnam time: the server TZ may differ while inventory compares UTC days.
  return d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

export interface BookingMailData {
  bookingCode: string;
  tourTitle: string;
  travelDate: Date | string;
  guests: number;
  total: number;
  customerName: string;
}

export function bookingConfirmationMail(b: BookingMailData): { subject: string; text: string } {
  return {
    subject: `Xác nhận đặt tour ${b.bookingCode} — Tour Booking`,
    text: [
      `Xin chào ${b.customerName},`,
      '',
      'Cảm ơn bạn đã đặt tour tại Tour Booking. Đơn của bạn đã được ghi nhận:',
      `• Mã booking: ${b.bookingCode}`,
      `• Tour: ${b.tourTitle}`,
      `• Ngày đi: ${viDate(b.travelDate)}`,
      `• Số khách: ${b.guests}`,
      `• Tổng tiền: ${vnd(b.total)}`,
      '',
      `Xem chi tiết & vé điện tử: ${bookingLink(b.bookingCode)}`,
      `Xác thực vé: ${verifyLink(b.bookingCode)}`,
      '',
      'Nếu thanh toán chuyển khoản/thẻ, vui lòng hoàn tất thanh toán để giữ chỗ. Tiền mặt trả khi khởi hành.',
      'Hỗ trợ: hotline 1900 1234.',
    ].join('\n'),
  };
}

export function bookingReminderMail(b: BookingMailData): { subject: string; text: string } {
  return {
    subject: `Nhắc nhở: tour ${b.tourTitle} khởi hành ngày mai (${viDate(b.travelDate)})`,
    text: [
      `Xin chào ${b.customerName},`,
      '',
      `Tour của bạn khởi hành vào NGÀY MAI (${viDate(b.travelDate)}):`,
      `• Mã booking: ${b.bookingCode}`,
      `• Tour: ${b.tourTitle}`,
      `• Số khách: ${b.guests}`,
      '',
      'Vui lòng có mặt đúng giờ tại điểm đón, mang theo giấy tờ tùy thân và vé điện tử:',
      verifyLink(b.bookingCode),
      '',
      `Chi tiết booking: ${bookingLink(b.bookingCode)}`,
      'Hỗ trợ: hotline 1900 1234.',
    ].join('\n'),
  };
}

export function reviewInviteMail(b: BookingMailData): { subject: string; text: string } {
  return {
    subject: `Bạn thấy tour ${b.tourTitle} thế nào? Đánh giá nhận ưu đãi lần sau`,
    text: [
      `Xin chào ${b.customerName},`,
      '',
      `Cảm ơn bạn đã đi tour ${b.tourTitle} cùng Tour Booking (mã ${b.bookingCode}).`,
      'Hãy chia sẻ trải nghiệm để giúp các du khách khác và nhận coupon cho lần sau:',
      `${bookingLink(b.bookingCode)}`,
      '',
      'Đánh giá chỉ mất 1 phút ngay trong mục Đặt chỗ của tôi.',
    ].join('\n'),
  };
}
