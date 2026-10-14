import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/common.js';
import { securityHeaders } from './middleware/security.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import { adminRouter as blogAdminRouter, default as blogRoutes } from './routes/blog.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import { adminRouter as chatAdminRouter, default as chatRoutes } from './routes/chat.routes.js';
import checkinRoutes from './routes/checkin.routes.js';
import { adminRouter as comboAdminRouter, default as comboRoutes } from './routes/combo.routes.js';
import contactRoutes from './routes/contact.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import favoriteRoutes from './routes/favorite.routes.js';
import loyaltyRoutes from './routes/loyalty.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import pushRoutes from './routes/push.routes.js';
import qaRoutes, { adminRouter as qaAdminRouter } from './routes/qa.routes.js';
import reviewRoutes from './routes/review.routes.js';
import tourRoutes from './routes/tour.routes.js';

/**
 * Same-PC origins plus LAN IPs, so the site also works when opened from a phone
 * or another device (e.g. http://192.168.x.x:3000) instead of localhost.
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // curl / non-browser clients have no Origin
  const fixed = [env.frontendUrl, ...env.extraOrigins, 'http://localhost:3000', 'http://localhost:5173'];
  if (fixed.includes(origin)) return true;
  // Open LAN/localhost is a DEV convenience (phone testing). Production serves
  // the exact configured origins only — otherwise any LAN page could call the
  // API with the user's cookies/credentials.
  if (env.isProduction) return false;
  try {
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return true;
  } catch {
    return false;
  }
  return false;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  app.use(securityHeaders);
  app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true }));
  // Review images can be base64 (3 x 700k) — 1mb would 413 before zod runs.
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'tour-booking-backend' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/tours', tourRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/favorites', favoriteRoutes);
  app.use('/api/loyalty', loyaltyRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/posts', blogRoutes);
  app.use('/api', qaRoutes);
  app.use('/api', chatRoutes);
  app.use('/api/combos', comboRoutes);
  app.use('/api/tickets', checkinRoutes);
  app.use('/api/push', pushRoutes);
  app.use('/api/admin', adminRoutes);
  // Admin sub-routers (already admin-guarded internally).
  app.use('/api/admin/posts', blogAdminRouter);
  app.use('/api/admin', qaAdminRouter);
  app.use('/api/admin', chatAdminRouter);
  app.use('/api/admin/combos', comboAdminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
