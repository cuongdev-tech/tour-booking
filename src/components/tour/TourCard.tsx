import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, Heart, MapPin, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useEnumLabels } from '../../i18n/enums';
import { formatCurrency, type Tour } from '../../types';
import { Spinner, SafeImage, Stars } from '../ui/kit';

export function FavoriteButton({ tourId, initial = false, onChange }: { tourId: string; initial?: boolean; onChange?: (tourId: string, fav: boolean) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  // Keep in sync when the parent list changes (refetch/remount with a new initial).
  useEffect(() => {
    setFav(initial);
  }, [initial]);

  // Lists outside Favorites pass favInitial=false by default — resolve the real
  // state once per tour so the heart isn't falsely empty for liked tours.
  useEffect(() => {
    if (!user || initial) return;
    const ctrl = new AbortController();
    api
      .get(`/favorites/${tourId}/check`, { signal: ctrl.signal })
      .then((r) => {
        if (!ctrl.signal.aborted) setFav(r.data.favorite === true);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [user, tourId, initial]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error(t('tourCard.loginToFavorite'));
      return;
    }
    setBusy(true);
    try {
      if (fav) {
        await api.delete(`/favorites/${tourId}`);
        setFav(false);
        onChange?.(tourId, false);
      } else {
        await api.post(`/favorites/${tourId}`);
        setFav(true);
        onChange?.(tourId, true);
        toast.success(t('tourCard.savedFavorite'));
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, t('tourCard.favoriteFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={t('tourCard.toggleFavorite')}
      aria-pressed={fav}
      aria-busy={busy || undefined}
      className={`flex h-11 w-11 items-center justify-center rounded-full shadow-md backdrop-blur transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${
        fav ? 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-700' : 'bg-white/95 text-slate-500 hover:text-rose-600 active:bg-white'
      }`}
    >
      {busy ? <Spinner className="h-4 w-4" /> : <Heart className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} aria-hidden />}
    </button>
  );
}

/** Marketing badge derived purely from existing Tour fields (no backend change). */
function marketingBadge(tour: Tour): 'bestSeller' | 'popular' | 'isNew' | null {
  if (tour.rating >= 4.8 && tour.reviewCount >= 20) return 'bestSeller';
  if (tour.featured) return 'popular';
  const created = new Date(tour.createdAt).getTime();
  if (!Number.isNaN(created) && Date.now() - created < 30 * 24 * 3600 * 1000) return 'isNew';
  return null;
}

/** Display title without a leading departure prefix ("Hanoi – Sapa 2D1N" -> "Sapa 2D1N")
 * so the card doesn't repeat the departure shown in the meta line above.
 * Matching is diacritic/case/punctuation-insensitive; non-matching titles stay intact. */
function stripDeparturePrefix(title: string, departure: string): string {
  // Explicit map: ơ/ư/đ don't decompose, so the NFD-strip shortcut corrupts them.
  const groups: Array<[string, string]> = [
    ['àáạảãâầấậẩẫăằắặẳẵ', 'a'],
    ['èéẹẻẽêềếệểễ', 'e'],
    ['ìíịỉĩ', 'i'],
    ['òóọỏõôồốộổỗơờớợởỡ', 'o'],
    ['ùúụủũưừứựửữ', 'u'],
    ['ỳýỵỷỹ', 'y'],
    ['đ', 'd'],
  ];
  const norm = (s: string) => {
    let out = s;
    for (const [chars, base] of groups) {
      out = out.replace(new RegExp(`[${chars}${chars.toUpperCase()}]`, 'g'), base);
    }
    return out.toLowerCase().replace(/[^a-z0-9]+/g, '');
  };
  const dep = norm(departure);
  if (!dep) return title;
  const m = /^(.+?)\s*[–—\-:|]\s*(.+)$/.exec(title.trim());
  if (!m) return title;
  const head = norm(m[1]);
  if (head === dep) return m[2].trim();
  // Abbreviation from the departure's capital initials, e.g. "TP.HCM" for
  // "TP. Hồ Chí Minh" (all-caps tokens keep every letter).
  const initials = departure
    .split(/[^A-Za-zÀ-ỹà-ỹĐđ]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 4 && w === w.toUpperCase() ? norm(w) : norm(w[0] ?? '')))
    .join('');
  if (head && head === initials) return m[2].trim();
  return title;
}

export function TourCard({ tour, favInitial = false, onToggleFavorite }: { tour: Tour; favInitial?: boolean; onToggleFavorite?: (tourId: string, fav: boolean) => void }) {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const soldOut = (tour.availableSeats ?? 0) <= 0;
  const badge = marketingBadge(tour);
  const badgeLabel = badge === 'bestSeller' ? t('tourCard.bestSeller') : badge === 'popular' ? t('tourCard.popular') : badge === 'isNew' ? t('tourCard.isNew') : null;
  const shortTitle = stripDeparturePrefix(tour.title, tour.departureLocation);
  const cover = tour.images?.[0] ?? '';
  const ratingText = (tour.rating ?? 0).toFixed(1);

  return (
    <Link
      to={`/tour/${tour.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
    >
      <div className="relative h-56 shrink-0 overflow-hidden bg-slate-100">
        <SafeImage
          src={cover}
          alt={tour.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-slate-900/20 transition-colors group-hover:bg-slate-900/10" />
        <div className="absolute left-3 top-3 flex max-w-[70%] flex-wrap gap-1.5">
          {badgeLabel && (
            <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-900 shadow-sm">
              {badgeLabel}
            </span>
          )}
          <span className="rounded-full bg-orange-700/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
            {labels.category(tour.category)}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {!soldOut && tour.availableSeats <= 5 && (
            <span className="rounded-full bg-red-600/95 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
              {t('tourCard.onlyLeft', { count: tour.availableSeats })}
            </span>
          )}
          {soldOut && (
            <span className="rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
              {t('tourDetails.soldOut')}
            </span>
          )}
        </div>
        <div className="absolute right-3 top-3">
          <FavoriteButton tourId={tour.id} initial={favInitial} onChange={onToggleFavorite} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-700" aria-hidden />
          <span className="truncate">{tour.departureLocation}</span>
        </p>
        <h3 className="mt-2 line-clamp-2 min-h-11 text-[17px] font-bold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-orange-800" title={shortTitle}>
          {shortTitle}
        </h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            {tour.duration}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            {t('bookings.guestsSuffix', { count: tour.maxGuests })}
          </span>
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <Stars value={tour.rating ?? 0} />
          <span className="text-[13px] font-medium tabular-nums text-slate-600">
            {ratingText} <span className="font-normal text-slate-400">({tour.reviewCount})</span>
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('tourCard.from')}</p>
            <p className="truncate text-[22px] font-bold tabular-nums leading-tight tracking-tight text-orange-700">
              {formatCurrency(tour.price)}
            </p>
            <p className="text-xs text-slate-400">{t('tourDetails.perGuest')}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-orange-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all group-hover:bg-orange-800 group-hover:shadow active:scale-[0.98]">
            {t('tourCard.details')} <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
