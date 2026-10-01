import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, Award, Headset, Landmark, MapPin, Mountain, Search, ShieldCheck, Star, Sun, Umbrella } from 'lucide-react';
import { api } from '../services/api';
import { FEATURED_DESTINATION_NAMES } from '../data/destinations';
import { useEnumLabels } from '../i18n/enums';
import { formatCurrency, type Tour } from '../types';
import { TourCard } from '../components/tour/TourCard';
import { DestinationCard } from '../components/tour/DestinationGallery';
import { TourSuggest } from '../components/tour/TourSuggest';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed';
import { Button, EmptyState, PageContainer, RetryState, SectionHeader, Skeleton, Stars, buttonClass } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

const DESTINATIONS = FEATURED_DESTINATION_NAMES.map((name) => ({ name }));

const STYLES = [
  { category: 'Beach', icon: Umbrella },
  { category: 'Mountains', icon: Mountain },
  { category: 'Culture', icon: Landmark },
  { category: 'Relaxation', icon: Sun },
];

export function Home() {
  const { t } = useTranslation();
  useDocumentMeta(t('home.title'), t('home.subtitle'));
  const labels = useEnumLabels();
  const navigate = useNavigate();
  const [destination, setDestination] = useState('');
  const [featured, setFeatured] = useState<Tour[]>([]);
  const [recommended, setRecommended] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { recent: recentTours } = useRecentlyViewed();

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .get('/tours', { params: { featured: true, limit: 6 }, signal: ctrl.signal })
      .then((res) => setFeatured(res.data.data))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setError(t('home.loadError'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    // Personal recommendations (auth-aware backend: guests get top featured).
    api
      .get('/tours/recommended', { signal: ctrl.signal })
      .then((res) => setRecommended(res.data.data ?? []))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [t]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    // Full-text `q` (not the destination column): it matches tour names,
    // descriptions AND destinations, consistent with the autocomplete above.
    const params = new URLSearchParams();
    if (destination.trim()) params.set('q', destination.trim());
    navigate(`/tours?${params.toString()}`);
  };

  const features = [
    { icon: ShieldCheck, title: t('home.why1Title'), text: t('home.why1Text') },
    { icon: Award, title: t('home.why2Title'), text: t('home.why2Text') },
    { icon: Headset, title: t('home.why3Title'), text: t('home.why3Text') },
  ];

  return (
    <MotionConfig reducedMotion="user">
      {/* Cinematic hero with floating search card */}
      <section className="relative overflow-hidden bg-slate-900">
        <img
          src="https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&q=75&w=2000"
          alt=""
          aria-hidden
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-900/50" aria-hidden />
        <PageContainer className="relative pb-32 pt-16 sm:pb-40 sm:pt-24 lg:pb-48 lg:pt-28">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white backdrop-blur">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden /> {t('home.trusted')}
            </p>
            <h1 className="mt-5 text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {t('home.title')}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-100 sm:text-xl">
              {t('home.subtitle')}
            </p>
          </motion.div>
        </PageContainer>
      </section>

      {/* Floating search card overlapping the hero */}
      <PageContainer className="relative z-10 -mt-24 sm:-mt-28">
        <form
          onSubmit={search}
          role="search"
          aria-label={t('home.search')}
          className="grid grid-cols-1 gap-3 rounded-3xl border border-slate-200/70 bg-white p-3 shadow-lift sm:p-4 lg:grid-cols-[1fr_auto] lg:items-stretch"
        >
          <label className="block rounded-2xl px-4 py-3 transition-colors focus-within:bg-slate-50 focus-within:ring-2 focus-within:ring-orange-100">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <MapPin className="h-3.5 w-3.5" aria-hidden /> {t('home.destinationPlaceholder')}
            </span>
            <TourSuggest
              id="home-destination"
              variant="bare"
              value={destination}
              onChange={setDestination}
              onPick={(tour) => navigate(`/tour/${tour.id}`)}
              placeholder={t('home.searchPlaceholder')}
              inputClassName="mt-1 w-full bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
            />
          </label>
          <Button type="submit" className="min-h-14 rounded-2xl px-10 py-4 text-base">
            <Search className="h-5 w-5" aria-hidden />
            {t('home.search')}
          </Button>
        </form>

        {/* Browse by travel style */}
        <motion.nav
          aria-label={t('tours.category')}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45 }}
          className="no-scrollbar mt-4 flex gap-2.5 overflow-x-auto pb-1"
        >
          {STYLES.map((s) => (
            <Link
              key={s.category}
              to={`/tours?category=${encodeURIComponent(s.category)}`}
              className="group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-full border border-slate-200/80 bg-white py-1.5 pl-1.5 pr-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-700 transition-colors group-hover:bg-orange-700 group-hover:text-white" aria-hidden>
                <s.icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-700">{labels.category(s.category)}</span>
            </Link>
          ))}
        </motion.nav>
      </PageContainer>

      {/* Popular destinations */}
      <PageContainer size="wide" id="destinations" className="relative scroll-mt-20 py-14 md:py-20">
        <span aria-hidden className="bg-dots pointer-events-none absolute right-0 top-10 hidden h-56 w-40 opacity-60 xl:block" />
        <span aria-hidden className="bg-dots pointer-events-none absolute bottom-10 left-0 hidden h-56 w-40 opacity-60 xl:block" />
        <SectionHeader
          title={t('home.popularTitle')}
          subtitle={t('home.popularSubtitle')}
          action={
            <Link to="/tours" className="hidden items-center gap-1 rounded-lg text-sm font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 md:inline-flex">
              {t('home.viewAll')} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 lg:grid-cols-6">
          {DESTINATIONS.map((d) => (
            <DestinationCard key={d.name} name={d.name} compact />
          ))}
        </div>
        <Link to="/tours" className="mt-6 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-semibold text-orange-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 md:hidden">
          {t('home.viewAll')} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </PageContainer>

      {/* Featured tours */}
      <section className="border-y border-slate-200/70 bg-white">
        <PageContainer size="wide" className="py-14 md:py-20">
          <SectionHeader
            title={t('home.featuredTitle')}
            subtitle={t('home.featuredSubtitle')}
            action={
              <Link to="/tours" className="hidden items-center gap-1 rounded-lg text-sm font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 md:inline-flex">
                {t('home.viewAll')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          {loading ? (
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-96" />)}
            </div>
          ) : error ? (
            <div className="mt-8">
              <RetryState title={t('tours.loadError')} hint={error} onRetry={() => window.location.reload()} retryLabel={t('tours.retry')} />
            </div>
          ) : featured.length === 0 ? (
            <div className="mt-8">
              <EmptyState title={t('tours.emptyTitle')} hint={t('tours.emptyHint')} action={<Link to="/tours"><Button>{t('home.viewAll')}</Button></Link>} />
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {featured.map((tour) => <TourCard key={tour.id} tour={tour} />)}
            </div>
          )}
        </PageContainer>
      </section>

      {/* Recommended for you (tastes from bookings/favorites; guests see top picks) */}
      {recommended.filter((r) => !featured.some((f) => f.id === r.id)).length > 0 && (
        <PageContainer size="wide" className="py-14 md:py-20">
          <SectionHeader
            title={t('home.recommendedTitle', { defaultValue: 'Gợi ý cho bạn' }) as string}
            subtitle={t('home.recommendedSubtitle', { defaultValue: 'Dựa trên tour bạn đã đặt và yêu thích' }) as string}
            action={
              <Link to="/tours" className="hidden items-center gap-1 rounded-lg text-sm font-semibold text-orange-700 transition-colors hover:text-orange-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 md:inline-flex">
                {t('home.viewAll')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {recommended
              .filter((r) => !featured.some((f) => f.id === r.id))
              .slice(0, 4)
              .map((tour) => <TourCard key={tour.id} tour={tour} />)}
          </div>
        </PageContainer>
      )}

      {/* Recently viewed (this device only) */}
      {recentTours.length > 0 && (
        <section className="border-y border-slate-200/70 bg-white">
          <PageContainer size="wide" className="py-14 md:py-20">
            <SectionHeader
              title={t('home.recentTitle', { defaultValue: 'Đã xem gần đây' }) as string}
            />
            <div className="no-scrollbar mt-8 flex gap-4 overflow-x-auto pb-1">
              {recentTours.map((r) => (
                <Link
                  key={r.id}
                  to={`/tour/${r.id}`}
                  className="group flex w-64 shrink-0 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  {r.image ? (
                    <img src={r.image} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="h-16 w-16 shrink-0 rounded-xl bg-slate-100" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 block text-sm font-semibold leading-snug text-slate-900 group-hover:text-orange-800">{r.title}</span>
                    <span className="mt-1 block text-sm font-bold tabular-nums text-orange-700">{formatCurrency(r.price)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </PageContainer>
        </section>
      )}

      {/* Why choose us */}
      <PageContainer className="py-14 md:py-20">
        <SectionHeader center title={t('home.whyTitle')} />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
          {features.map((f, i) => (
            <div key={f.title} className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-7 text-center shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
              <span aria-hidden className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-[64px] font-bold leading-none text-slate-100">
                {i + 1}
              </span>
              <span className="relative mx-auto flex h-13 w-13 items-center justify-center rounded-2xl bg-orange-700 p-3.5 text-white shadow-sm">
                <f.icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="relative mt-4 text-[17px] font-bold tracking-tight text-slate-900">{f.title}</h3>
              <p className="relative mt-1.5 text-sm leading-relaxed text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>
      </PageContainer>

      {/* Image CTA — full-bleed photo band */}
      <section className="relative my-16 overflow-hidden md:my-24">
        <img
          src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&q=80&w=2000"
          alt=""
          aria-hidden
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-slate-900/55" aria-hidden />
        <PageContainer className="relative py-14 sm:py-20">
          <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left">
            <div className="max-w-xl">
              <div className="flex justify-center md:justify-start"><Stars value={5} className="text-amber-300" /></div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{t('home.ctaTitle')}</h2>
              <p className="mt-2 text-lg text-slate-200">{t('home.ctaSubtitle')}</p>
            </div>
            <Link to="/tours" className={buttonClass('accent', 'shrink-0 px-10 py-4 text-base')}>
              {t('home.ctaButton')} <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </PageContainer>
      </section>
    </MotionConfig>
  );
}
