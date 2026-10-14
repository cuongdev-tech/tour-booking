import { releaseExpiredHolds } from '../services/booking.service.js';

const MIN_MS = 60 * 1000;

/** Hold sweeper: release expired PENDING holds every minute (single + multi instance safe). */
export function startHoldSweeper(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await releaseExpiredHolds(100);
      if (r.released > 0) console.log(`Hold sweeper released ${r.released} booking(s)`);
    } catch (err) {
      console.error('hold sweeper tick failed:', err);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 60_000).unref?.();
  setInterval(() => void tick(), MIN_MS).unref?.();
  console.log('Hold sweeper enabled (every 60s)');
}
