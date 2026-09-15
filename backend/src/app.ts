import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/common.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import favoriteRoutes from './routes/favorite.routes.js';
import reviewRoutes from './routes/review.routes.js';
import tourRoutes from './routes/tour.routes.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: [env.frontendUrl, 'http://localhost:3000', 'http://localhost:5173'], credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'tour-booking-backend' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/tours', tourRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/coupons', couponRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/favorites', favoriteRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
