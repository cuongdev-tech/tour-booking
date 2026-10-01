import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { startBookingReminders } from './utils/reminders.js';

const app = createApp();
app.listen(env.port, () => {
  console.log(`Tour Booking API listening on http://localhost:${env.port}`);
});
startBookingReminders();
