import { useCallback, useEffect, useState } from 'react';

export interface RecentTour {
  id: string;
  title: string;
  image?: string;
  price: number;
}

const KEY = 'tourbooking_recent';
const MAX = 8;
const EVENT = 'tourbooking:recent-changed';

function load(): RecentTour[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentTour =>
          !!r && typeof r === 'object' && typeof (r as RecentTour).id === 'string' && typeof (r as RecentTour).title === 'string',
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** Push a tour to the front (dedupe, cap 8). Fire-and-forget, never throws. */
export function pushRecent(tour: RecentTour): void {
  try {
    const next = [{ ...tour }, ...load().filter((r) => r.id !== tour.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage unavailable */
  }
}

/** Reactive recently-viewed list (updates when any page pushes). */
export function useRecentlyViewed(): { recent: RecentTour[]; clearRecent: () => void } {
  const [list, setList] = useState<RecentTour[]>(() => load());
  useEffect(() => {
    const refresh = () => setList(load());
    window.addEventListener(EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setList([]);
  }, []);
  return { recent: list, clearRecent: clear };
}
