import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { api } from '../services/api';
import { DestinationCard } from '../components/tour/DestinationGallery';
import { EmptyState, PageContainer, RetryState, Skeleton } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

interface DestinationRow {
  destination: string;
  count: number;
}

export function Destinations() {
  const { t } = useTranslation();
  useDocumentMeta(t('destinations.title'), t('destinations.subtitle'));
  const [rows, setRows] = useState<DestinationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .get('/tours/destinations', { signal: ctrl.signal })
      .then((res) => setRows(res.data.data ?? []))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setError(t('tours.loadError'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [t]);

  return (
    <PageContainer size="wide" className="py-8 md:py-12">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-700">{t('nav.destinations')}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t('destinations.title')}</h1>
        <p className="mt-2 text-slate-500">{t('destinations.subtitle')}</p>
      </div>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-72" />)}
        </div>
      ) : error ? (
        <div className="mt-8">
          <RetryState title={t('tours.loadError')} hint={error} onRetry={() => window.location.reload()} retryLabel={t('tours.retry')} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('tours.emptyTitle')} hint={t('tours.emptyHint')} />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <DestinationCard key={r.destination} name={r.destination} count={r.count} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
