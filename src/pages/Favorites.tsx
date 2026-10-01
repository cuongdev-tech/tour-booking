import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import type { Favorite } from '../types';
import { TourCard } from '../components/tour/TourCard';
import { Button, EmptyState, PageContainer, RetryState, Skeleton } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function Favorites() {
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // INACTIVE tours are hidden from the grid — count only what is actually shown
  // so the title never promises more cards than the user sees.
  const visible = favorites.filter((f) => f.tour && f.tour.status !== 'INACTIVE');
  useDocumentMeta(t('favorites.title', { count: visible.length }));

  const abortRef = useRef<AbortController | null>(null);

  const load = () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setLoadFailed(false);
    api
      .get('/favorites', { signal: ctrl.signal })
      .then((res) => setFavorites(res.data.data))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setLoadFailed(true);
        toast.error(apiErrorMessage(err, t('favorites.loadFailed')));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  };
  useEffect(load, [t]);
  useEffect(() => () => abortRef.current?.abort(), []);

  if (loading) {
    return (
      <PageContainer className="py-8 md:py-10">
        <Skeleton className="h-9 w-56" />
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}
        </div>
      </PageContainer>
    );
  }
  if (loadFailed && favorites.length === 0) {
    return (
      <PageContainer className="py-8 md:py-10">
        <RetryState title={t('favorites.loadFailed')} onRetry={load} retryLabel={t('tours.retry')} />
      </PageContainer>
    );
  }
  if (favorites.length === 0) {
    return (
      <PageContainer className="py-8 md:py-10">
        <EmptyState
          icon={<Heart className="h-6 w-6" aria-hidden />}
          title={t('favorites.emptyTitle')}
          hint={t('favorites.emptyHint')}
          action={<Link to="/tours"><Button>{t('favorites.browseTours')}</Button></Link>}
        />
      </PageContainer>
    );
  }
  if (visible.length === 0) {
    return (
      <PageContainer className="py-8 md:py-10">
        <EmptyState
          icon={<Heart className="h-6 w-6" aria-hidden />}
          title={t('favorites.emptyTitle')}
          hint={t('favorites.emptyHint')}
          action={<Link to="/tours"><Button>{t('favorites.browseTours')}</Button></Link>}
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer className="py-8 md:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{t('favorites.title', { count: visible.length })}</h1>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((f) => (
          <TourCard
            key={f.id}
            tour={f.tour!}
            favInitial
            onToggleFavorite={(tourId, fav) => {
              // Unfavoriting here removes the card immediately instead of leaving a stale entry.
              if (!fav) setFavorites((prev) => prev.filter((x) => x.tourId !== tourId));
            }}
          />
        ))}
      </div>
    </PageContainer>
  );
}
