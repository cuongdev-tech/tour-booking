import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { ArrowRight, Award, Headset, MapPin, Search, ShieldCheck, Star } from 'lucide-react';
import { api } from '../services/api';
import type { Tour } from '../types';
import { TourCard } from '../components/tour/TourCard';
import { Button, Card, EmptyState, Skeleton, Stars } from '../components/ui/kit';

const DESTINATIONS = [
  { name: 'Da Nang', img: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&q=80&w=800' },
  { name: 'Phu Quoc', img: 'https://images.unsplash.com/photo-1557406981-2292f7411bc4?auto=format&fit=crop&q=80&w=800' },
  { name: 'Ha Long', img: 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&q=80&w=800' },
  { name: 'Sapa', img: 'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?auto=format&fit=crop&q=80&w=800' },
  { name: 'Hoi An', img: 'https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?auto=format&fit=crop&q=80&w=800' },
  { name: 'Da Lat', img: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=800' },
];

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [destination, setDestination] = useState('');
  const [featured, setFeatured] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/tours', { params: { featured: true, limit: 6 } })
      .then((res) => setFeatured(res.data.data))
      .catch(() => setError(t('home.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (destination.trim()) params.set('destination', destination.trim());
    navigate(`/tours?${params.toString()}`);
  };

  const features = [
    { icon: ShieldCheck, title: t('home.why1Title'), text: t('home.why1Text') },
    { icon: Award, title: t('home.why2Title'), text: t('home.why2Text') },
    { icon: Headset, title: t('home.why3Title'), text: t('home.why3Text') },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-900">
        <img
          src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&q=80&w=2000"
          alt="Vietnam travel"
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white">
              <Star className="h-3.5 w-3.5 text-amber-400" /> {t('home.trusted')}
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight text-white md:text-6xl">
              {t('home.title')}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-200">
              {t('home.subtitle')}
            </p>
            <form onSubmit={search} className="mt-8 flex max-w-3xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-xl md:flex-row">
              <div className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('home.searchPlaceholder')}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-xl border-t border-slate-100 px-3 py-2 md:border-l md:border-t-0">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={t('home.destinationPlaceholder')}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <Button type="submit" className="bg-orange-500 px-8 hover:bg-orange-600">{t('home.search')}</Button>
            </form>
          </motion.div>
        </div>
      </section>

      {/* Popular destinations */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">{t('home.popularTitle')}</h2>
            <p className="mt-1 text-slate-500">{t('home.popularSubtitle')}</p>
          </div>
          <Link to="/tours" className="hidden items-center gap-1 text-sm font-semibold text-teal-700 hover:underline md:inline-flex">
            {t('home.viewAll')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {DESTINATIONS.map((d) => (
            <Link
              key={d.name}
              to={`/tours?destination=${encodeURIComponent(d.name)}`}
              className="group relative h-44 overflow-hidden rounded-2xl"
            >
              <img src={d.img} alt={d.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
              <span className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" />
              <span className="absolute bottom-3 left-3 font-semibold text-white">{d.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured tours */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">{t('home.featuredTitle')}</h2>
          <p className="mt-1 text-slate-500">{t('home.featuredSubtitle')}</p>
          {loading ? (
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}
            </div>
          ) : error ? (
            <div className="mt-8"><EmptyState title={t('tours.loadError')} hint={error} /></div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {featured.map((tour) => <TourCard key={tour.id} tour={tour} />)}
            </div>
          )}
        </div>
      </section>

      {/* Why choose us */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold text-slate-900 md:text-3xl">{t('home.whyTitle')}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Reviews + CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <Card className="flex flex-col items-center gap-4 bg-slate-900 p-10 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <div className="flex justify-center md:justify-start"><Stars value={5} /></div>
            <h2 className="mt-3 text-2xl font-bold text-white md:text-3xl">{t('home.ctaTitle')}</h2>
            <p className="mt-1 text-slate-300">{t('home.ctaSubtitle')}</p>
          </div>
          <Link to="/tours" className="rounded-xl bg-orange-500 px-8 py-3 font-semibold text-white hover:bg-orange-600">
            {t('home.ctaButton')}
          </Link>
        </Card>
      </section>
    </div>
  );
}
