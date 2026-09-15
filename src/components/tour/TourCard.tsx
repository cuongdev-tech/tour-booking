import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useEnumLabels } from '../../i18n/enums';
import { formatCurrency, type Tour } from '../../types';
import { Stars } from '../ui/kit';

export function FavoriteButton({ tourId, initial = false }: { tourId: string; initial?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

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
      } else {
        await api.post(`/favorites/${tourId}`);
        setFav(true);
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
      className={`rounded-full p-2 shadow-sm transition-colors ${
        fav ? 'bg-rose-600 text-white' : 'bg-white/90 text-slate-600 hover:text-rose-600'
      }`}
    >
      <Heart className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} />
    </button>
  );
}

export function TourCard({ tour, favInitial = false }: { tour: Tour; favInitial?: boolean }) {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  return (
    <Link
      to={`/tour/${tour.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-52 overflow-hidden">
        <img
          src={tour.images[0]}
          alt={tour.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-teal-700">
            {labels.category(tour.category)}
          </span>
          {tour.availableSeats <= 5 && (
            <span className="rounded-full bg-red-600/95 px-2.5 py-1 text-[11px] font-bold text-white">
              {t('tourCard.onlyLeft', { count: tour.availableSeats })}
            </span>
          )}
        </div>
        <div className="absolute right-3 top-3">
          <FavoriteButton tourId={tour.id} initial={favInitial} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-600" />
          <span className="truncate">{tour.departureLocation} → {tour.destination}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {tour.duration} · {tour.transportation.map((m) => labels.transportation(m)).join(' + ')}
        </p>
        <h3 className="mt-2 line-clamp-2 font-semibold text-slate-900 group-hover:text-teal-700">{tour.title}</h3>
        <div className="mt-2 flex items-center gap-2">
          <Stars value={tour.rating} />
          <span className="text-xs text-slate-500">
            {tour.rating.toFixed(1)} ({tour.reviewCount})
          </span>
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('tourCard.from')}</p>
            <p className="text-lg font-bold text-teal-700">{formatCurrency(tour.price)}</p>
          </div>
          <span className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white group-hover:bg-teal-700">
            {t('tourCard.details')}
          </span>
        </div>
      </div>
    </Link>
  );
}
