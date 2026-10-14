import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { RotateCcw, Search, SearchX, SlidersHorizontal } from 'lucide-react';
import { api } from '../services/api';
import { useEnumLabels } from '../i18n/enums';
import type { Pagination, Tour } from '../types';
import { TourCard } from '../components/tour/TourCard';
import { TourSuggest } from '../components/tour/TourSuggest';
import { Button, EmptyState, Input, Modal, PageContainer, Pager, RetryState, Select, Skeleton } from '../components/ui/kit';
import { useDebounce } from '../hooks/useDebounce';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

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
  useDocumentMeta(t('tours.title'), t('tours.defaultSubtitle'));
  const labels = useEnumLabels();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [qInput, setQInput] = useState(params.get('q') ?? '');
  const q = useDebounce(qInput, 300);
  // Destination is typed into a controlled input and mirrored to the URL debounced,
  // so every keystroke no longer pushes history entries and refetches.
  const [destInput, setDestInput] = useState(params.get('destination') ?? '');
  const destDebounced = useDebounce(destInput, 300);
  const [tours, setTours] = useState<Tour[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const SORTS = [
    { value: 'newest', label: t('tours.sortNewest') },
    { value: 'price_asc', label: t('tours.sortPriceAsc') },
    { value: 'price_desc', label: t('tours.sortPriceDesc') },
    { value: 'rating', label: t('tours.sortRating') },
    { value: 'departure_earliest', label: t('tours.sortDeparture', { defaultValue: 'Giờ KH sớm nhất' }) as string },
  ];

  const categoryLabel = (c: string): string => (c ? labels.category(c) : t('tours.all'));

  const category = params.get('category') ?? '';
  const departure = params.get('departure') ?? '';
  const destination = params.get('destination') ?? '';
  const sort = params.get('sort') ?? 'newest';
  // Advanced: travel date + party size filter (only tours with seats left).
  const travelDate = params.get('date') ?? '';
  const guestsParam = params.get('guests') ?? '';
  const availableOnly = params.get('availableOnly') === 'true';
  // Guard the page number: ?page=abc must behave as page 1, never NaN.
  const rawPage = Number(params.get('page') ?? 1);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const minRating = params.get('minRating') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  // The rating filter stores the real threshold (4.5), so the URL is truthful.
  const minRatingNum = Number(minRating);
  const minRatingValue = minRating !== '' && Number.isFinite(minRatingNum) && minRatingNum > 0 ? minRatingNum : undefined;

  const query = useMemo(() => {
    const gNum = Number(guestsParam);
    const maxP = Number(maxPrice);
    const dateOk = travelDate && !Number.isNaN(Date.parse(travelDate)) ? travelDate : undefined;
    return {
      q: q || undefined,
      category: category || undefined,
      departure: departure || undefined,
      destination: destination || undefined,
      sort,
      page,
      limit: 9,
      minRating: minRatingValue,
      maxPrice: maxPrice && Number.isFinite(maxP) ? maxP : undefined,
      date: dateOk,
      guests: guestsParam && Number.isFinite(gNum) && gNum > 0 ? Math.floor(gNum) : undefined,
      availableOnly: availableOnly || undefined,
    };
  },
    [q, category, departure, destination, sort, page, minRating, minRatingValue, maxPrice, travelDate, guestsParam, availableOnly],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    api
      .get('/tours', { params: query, signal: ctrl.signal })
      .then((res) => {
        setTours(res.data.data);
        setPagination(res.data.pagination);
      })
      .catch((err) => {
        // A superseded request is not an error — the newer one will render.
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setError(t('tours.loadError'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, t, attempt]);

  // Functional updater: rapid consecutive filter changes can't clobber each other
  // on a stale `params` closure.
  const set = (key: string, value: string, replace = false) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      replace ? { replace: true } : undefined,
    );
  };

  // Mirror the debounced keyword into ?q= so searches are shareable and survive refresh.
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    set('q', q, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Mirror debounced destination typing into the URL (replace, not push).
  useEffect(() => {
    if ((params.get('destination') ?? '') === destDebounced) return;
    set('destination', destDebounced, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destDebounced]);

  // If the URL changes from elsewhere (back/forward, clear), resync the inputs —
  // unless the user is actively typing in them.
  useEffect(() => {
    const active = document.activeElement;
    const typingSearch = active instanceof HTMLInputElement && active.id.startsWith('tour-search-');
    const typingDest = active instanceof HTMLInputElement && active.id.startsWith('tour-destination-');
    const urlQ = params.get('q') ?? '';
    const urlDest = params.get('destination') ?? '';
    if (!typingSearch && urlQ !== qInput) setQInput(urlQ);
    if (!typingDest && urlDest !== destInput) setDestInput(urlDest);
  }, [params, qInput, destInput]);

  // A page beyond the last one (stale link/bookmark) steps back automatically
  // instead of stranding the user on an empty grid.
  useEffect(() => {
    if (!loading && pagination && pagination.totalPages >= 1 && page > pagination.totalPages) {
      set('page', String(pagination.totalPages));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pagination, page]);

  const clearAll = () => {
    setParams({});
    setQInput('');
    setDestInput('');
  };

  const hasFilter = Boolean(qInput || category || departure || destination || sort !== 'newest' || minRating || maxPrice || travelDate || guestsParam || availableOnly);

  const filterLabel = 'mb-1.5 block text-sm font-medium text-slate-700';

  const renderFilters = (idPrefix: string) => (
    <div className="space-y-5">
      <div className="relative">
        <label htmlFor={`tour-search-${idPrefix}`} className={filterLabel}>{t('tours.search')}</label>
        <TourSuggest
          id={`tour-search-${idPrefix}`}
          value={qInput}
          onChange={setQInput}
          onPick={(tour) => navigate(`/tour/${tour.id}`)}
          placeholder={t('tours.searchPlaceholder')}
          inputClassName="pl-10"
          startAdornment={<Search className="pointer-events-none absolute bottom-3 left-3.5 z-10 h-4 w-4 text-slate-400" aria-hidden />}
        />
      </div>
      <div>
        <label htmlFor={`tour-destination-${idPrefix}`} className={filterLabel}>{t('tours.destination')}</label>
        <Input
          id={`tour-destination-${idPrefix}`}
          value={destInput}
          onChange={(e) => setDestInput(e.target.value)}
          placeholder={t('tours.destinationPlaceholder')}
        />
      </div>
      <div>
        <label htmlFor={`tour-departure-${idPrefix}`} className={filterLabel}>{t('tours.departure')}</label>
        <Select id={`tour-departure-${idPrefix}`} value={departure} onChange={(e) => set('departure', e.target.value)}>
          {DEPARTURES.map((d) => (
            <option key={d || 'all'} value={d}>{d || t('tours.all')}</option>
          ))}
        </Select>
      </div>
      <fieldset>
        <legend className={filterLabel}>{t('tours.category')}</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <button
                key={c || 'all'}
                type="button"
                onClick={() => set('category', c)}
                aria-pressed={active}
                className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 enabled:active:scale-95 disabled:opacity-50 ${
                  active ? 'bg-orange-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
                }`}
              >
                {categoryLabel(c)}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`tour-maxprice-${idPrefix}`} className={filterLabel}>{t('tours.maxPrice')}</label>
          <Select id={`tour-maxprice-${idPrefix}`} value={maxPrice} onChange={(e) => set('maxPrice', e.target.value)}>
            <option value="">{t('tours.anyPrice')}</option>
            <option value="2000000">{t('tours.under2m')}</option>
            <option value="4000000">{t('tours.under4m')}</option>
            <option value="6000000">{t('tours.under6m')}</option>
          </Select>
        </div>
        <div>
          <label htmlFor={`tour-sort-${idPrefix}`} className={filterLabel}>{t('tours.sortBy')}</label>
          <Select id={`tour-sort-${idPrefix}`} value={sort} onChange={(e) => set('sort', e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 transition-colors hover:border-orange-300 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700 active:bg-slate-50 has-checked:border-orange-700 has-checked:bg-orange-50">
              <input
                type="checkbox"
                checked={minRating !== ''}
                onChange={(e) => set('minRating', e.target.checked ? '4.5' : '')}
          className="h-4 w-4 rounded border-slate-300 accent-orange-700"
        />
        {t('tours.rating45')}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`tour-date-${idPrefix}`} className={filterLabel}>{t('tourDetails.travelDate')}</label>
          <Input id={`tour-date-${idPrefix}`} type="date" value={travelDate} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div>
          <label htmlFor={`tour-guests-${idPrefix}`} className={filterLabel}>{t('tourDetails.guests')}</label>
          <Input
            id={`tour-guests-${idPrefix}`}
            type="number"
            min={1}
            max={20}
            value={guestsParam}
            onChange={(e) => set('guests', e.target.value)}
            placeholder="2"
          />
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 transition-colors hover:border-orange-300 active:bg-slate-50 has-checked:border-orange-700 has-checked:bg-orange-50">
        <input
          type="checkbox"
          checked={availableOnly}
          onChange={(e) => set('availableOnly', e.target.checked ? 'true' : '')}
          className="h-4 w-4 rounded border-slate-300 accent-orange-700"
        />
        {t('tours.availableOnly', { defaultValue: 'Chỉ hiện tour còn chỗ' }) as string}
      </label>
    </div>
  );

  return (
    <PageContainer size="wide" className="py-8 md:py-12">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-700">{t('nav.tours')}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t('tours.title')}</h1>
        <p className="mt-2 text-slate-500">
          {pagination ? t('tours.found', { total: pagination.total }) : t('tours.defaultSubtitle')}
        </p>
      </div>

      {/* Mobile filter bar → opens drawer */}
      <div className="mt-6 flex items-center gap-2 lg:hidden">
        <Button variant="secondary" onClick={() => setDrawerOpen(true)} className="flex-1 py-3" aria-haspopup="dialog">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {t('tours.filters')}
          {hasFilter && <span aria-hidden className="h-2 w-2 rounded-full bg-orange-700" />}
        </Button>
        {hasFilter && (
          <Button variant="ghost" onClick={clearAll} className="gap-1.5 px-3 text-orange-700 hover:bg-orange-50 hover:text-orange-800" aria-label={t('tours.clear')}>
            <RotateCcw className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-4 lg:gap-8">
        {/* Filters sidebar (desktop) */}
        <aside className="hidden lg:col-span-1 lg:block">
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft lg:sticky lg:top-24">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 font-bold tracking-tight text-slate-900">
                <SlidersHorizontal className="h-4 w-4 text-slate-400" aria-hidden /> {t('tours.filters')}
              </p>
              {hasFilter && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg px-2 py-2 text-[13px] font-semibold text-orange-700 transition-colors hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  {t('tours.clear')}
                </button>
              )}
            </div>
            {renderFilters('desktop')}
          </div>
        </aside>

        {/* Grid */}
        <div className="min-w-0 lg:col-span-3">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-96" />)}
            </div>
          ) : error ? (
            <RetryState title={t('tours.loadError')} hint={error} onRetry={() => setAttempt((a) => a + 1)} retryLabel={t('tours.retry')} />
          ) : tours.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" aria-hidden />}
              title={t('tours.emptyTitle')}
              hint={t('tours.emptyHint')}
              action={<Button variant="secondary" onClick={clearAll}>{t('tours.clear')}</Button>}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {tours.map((tour) => <TourCard key={tour.id} tour={tour} />)}
              </div>
              <Pager pagination={pagination} onPage={(p) => set('page', String(p))} />
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      <Modal open={drawerOpen} onClose={() => setDrawerOpen(false)} label={t('tours.filters')} wide>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          <SlidersHorizontal className="h-5 w-5 text-slate-400" aria-hidden /> {t('tours.filters')}
        </h2>
        <div className="mt-4">{renderFilters('drawer')}</div>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" onClick={clearAll} className="flex-1">
            {t('tours.clear')}
          </Button>
          <Button onClick={() => setDrawerOpen(false)} className="flex-[2]">
            {t('tours.showResults', { count: pagination?.total ?? tours.length })}
          </Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
