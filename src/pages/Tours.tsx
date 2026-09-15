import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { useEnumLabels } from '../i18n/enums';
import type { Pagination, Tour } from '../types';
import { TourCard } from '../components/tour/TourCard';
import { Button, EmptyState, Input, Select, Skeleton } from '../components/ui/kit';
import { useDebounce } from '../hooks/useDebounce';

const CATEGORIES = ['', 'Beach', 'Mountains', 'Culture', 'Relaxation'];

const DEPARTURES = [
  '',
  'TP. Hồ Chí Minh',
  'Hà Nội',
  'Đà Nẵng',
  'Nha Trang',
  'Cần Thơ',
  'Phú Quốc',
];

export function Tours() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [params, setParams] = useSearchParams();
  const [qInput, setQInput] = useState(params.get('q') ?? '');
  const q = useDebounce(qInput, 300);
  const [tours, setTours] = useState<Tour[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const SORTS = [
    { value: 'newest', label: t('tours.sortNewest') },
    { value: 'price_asc', label: t('tours.sortPriceAsc') },
    { value: 'price_desc', label: t('tours.sortPriceDesc') },
    { value: 'rating', label: t('tours.sortRating') },
  ];

  const categoryLabel = (c: string): string => (c ? labels.category(c) : t('tours.all'));

  const category = params.get('category') ?? '';
  const departure = params.get('departure') ?? '';
  const destination = params.get('destination') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Number(params.get('page') ?? 1);
  const minRating = params.get('minRating') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';

  const query = useMemo(
    () => ({
      q: q || undefined,
      category: category || undefined,
      departure: departure || undefined,
      destination: destination || undefined,
      sort,
      page,
      limit: 9,
      minRating: minRating ? 4.5 : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    }),
    [q, category, departure, destination, sort, page, minRating, maxPrice],
  );

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get('/tours', { params: query })
      .then((res) => {
        setTours(res.data.data);
        setPagination(res.data.pagination);
      })
      .catch(() => setError(t('tours.loadError')))
      .finally(() => setLoading(false));
  }, [query, t]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">{t('tours.title')}</h1>
      <p className="mt-1 text-slate-500">{pagination ? t('tours.found', { total: pagination.total }) : t('tours.defaultSubtitle')}</p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Filters */}
        <aside className="lg:col-span-1">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-24">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('tours.search')}</label>
              <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t('tours.searchPlaceholder')} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('tours.destination')}</label>
              <Input value={destination} onChange={(e) => set('destination', e.target.value)} placeholder={t('tours.destinationPlaceholder')} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('tours.departure')}</label>
              <Select value={departure} onChange={(e) => set('departure', e.target.value)}>
                {DEPARTURES.map((d) => (
                  <option key={d || 'all'} value={d}>{d || t('tours.all')}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('tours.category')}</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c || 'all'}
                    onClick={() => set('category', c)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      category === c ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {categoryLabel(c)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('tours.maxPrice')}</label>
              <Select value={maxPrice} onChange={(e) => set('maxPrice', e.target.value)}>
                <option value="">{t('tours.anyPrice')}</option>
                <option value="2000000">{t('tours.under2m')}</option>
                <option value="4000000">{t('tours.under4m')}</option>
                <option value="6000000">{t('tours.under6m')}</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={minRating === '1'}
                onChange={(e) => set('minRating', e.target.checked ? '1' : '')}
                className="h-4 w-4 rounded border-slate-300 text-teal-600"
              />
              {t('tours.rating45')}
            </label>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('tours.sortBy')}</label>
              <Select value={sort} onChange={(e) => set('sort', e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setParams({});
                setQInput('');
              }}
            >
              {t('tours.clear')}
            </Button>
          </div>
        </aside>

        {/* Grid */}
        <div className="lg:col-span-3">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-80" />)}
            </div>
          ) : error ? (
            <EmptyState title={t('tours.loadError')} hint={error} action={<Button onClick={() => window.location.reload()}>{t('tours.retry')}</Button>} />
          ) : tours.length === 0 ? (
            <EmptyState
              title={t('tours.emptyTitle')}
              hint={t('tours.emptyHint')}
              action={
                <Button variant="secondary" onClick={() => { setParams({}); setQInput(''); }}>
                  {t('tours.clear')}
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {tours.map((tour) => <TourCard key={tour.id} tour={tour} />)}
              </div>
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
                    {t('tours.previous')}
                  </Button>
                  <span className="text-sm text-slate-500">{t('tours.pageOf', { page: pagination.page, pages: pagination.totalPages })}</span>
                  <Button variant="secondary" disabled={page >= pagination.totalPages} onClick={() => set('page', String(page + 1))}>
                    {t('tours.next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
