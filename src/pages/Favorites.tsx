import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../services/api';
import type { Favorite } from '../types';
import { TourCard } from '../components/tour/TourCard';
import { Button, EmptyState, Skeleton } from '../components/ui/kit';

export function Favorites() {
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/favorites')
      .then((res) => setFavorites(res.data.data))
      .catch(() => toast.error(t('favorites.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}
        </div>
      </div>
    );
  }
  if (favorites.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <EmptyState title={t('favorites.emptyTitle')} hint={t('favorites.emptyHint')} action={<Link to="/tours"><Button>{t('favorites.browseTours')}</Button></Link>} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">{t('favorites.title', { count: favorites.length })}</h1>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {favorites.map((f) => f.tour && <TourCard key={f.id} tour={f.tour} favInitial />)}
      </div>
    </div>
  );
}
