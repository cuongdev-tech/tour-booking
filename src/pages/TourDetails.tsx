import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Check, MapPin, Minus, Plus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useEnumLabels } from '../i18n/enums';
import { useServiceLabel } from '../i18n/services';
import { formatCurrency, type Review, type Tour } from '../types';
import { TourCard } from '../components/tour/TourCard';
import { FavoriteButton } from '../components/tour/TourCard';
import { Button, Card, EmptyState, Skeleton, Stars } from '../components/ui/kit';

export function TourDetails() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const serviceLabel = useServiceLabel();
  const { id } = useParams();
  const navigate = useNavigate();
  const [tour, setTour] = useState<Tour | null>(null);
  const [related, setRelated] = useState<Tour[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(2);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.get(`/tours/${id}`), api.get(`/reviews/tour/${id}`)])
      .then(([tourRes, r]) => {
        setTour(tourRes.data.tour);
        setRelated(tourRes.data.related ?? []);
        setReviews(r.data.data ?? []);
      })
      .catch(() => setError(t('tourDetails.notFoundHint')))
      .finally(() => setLoading(false));
  }, [id, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="h-96" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (error || !tour) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <EmptyState title={t('tourDetails.notFound')} hint={error} action={<Link to="/tours"><Button>{t('tourDetails.backToTours')}</Button></Link>} />
      </div>
    );
  }

  const maxGuests = Math.min(tour.maxGuests, tour.availableSeats);
  const bookNow = () => {
    if (!date) {
      toast.error(t('tourDetails.chooseDate'));
      return;
    }
    if (guests < tour.minGuests || guests > maxGuests) {
      toast.error(t('tourDetails.guestsRange', { min: tour.minGuests, max: maxGuests }));
      return;
    }
    navigate(`/checkout?tourId=${tour.id}&date=${date}&guests=${guests}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-sm text-slate-500">
        <Link to="/" className="hover:text-teal-700">{t('nav.home')}</Link> / <Link to="/tours" className="hover:text-teal-700">{t('nav.tours')}</Link> /{' '}
        <span className="text-slate-900">{tour.title}</span>
      </nav>

      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <img src={tour.images[activeImg]} alt={tour.title} className="h-96 w-full object-cover" />
          </div>
          {tour.images.length > 1 && (
            <div className="mt-3 flex gap-3">
              {tour.images.map((img, i) => (
                <button key={img} onClick={() => setActiveImg(i)} className={`h-20 w-28 overflow-hidden rounded-xl border-2 ${i === activeImg ? 'border-teal-600' : 'border-transparent'}`}>
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-teal-600" /> {tour.destination}</span>
            <span>·</span><span>{tour.duration}</span><span>·</span>
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">{labels.category(tour.category)}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{tour.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Stars value={tour.rating} />
            <span className="text-sm text-slate-500">{tour.rating.toFixed(1)} · {tour.reviewCount}</span>
          </div>
          <p className="mt-5 leading-relaxed text-slate-600">{tour.description}</p>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tourDetails.departure')}</p>
              <p className="mt-1 font-semibold text-slate-900">{tour.departureLocation}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tourDetails.destination')}</p>
              <p className="mt-1 font-semibold text-slate-900">{tour.destination}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tourDetails.duration')}</p>
              <p className="mt-1 font-semibold text-slate-900">{tour.duration}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('tourDetails.transportation')}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {tour.transportation.map((m) => labels.transportation(m)).join(' + ')}
              </p>
            </div>
          </div>

          <Card className="mt-6 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Calendar className="h-5 w-5 text-teal-600" /> {t('itinerary.title')}
            </h2>
            {!Array.isArray(tour.itinerary) || tour.itinerary.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('itinerary.emptyTitle')}</p>
            ) : (
              <ol className="mt-5">
                {[...tour.itinerary].sort((a, b) => a.day - b.day).map((d, i, arr) => (
                  <li key={d.day} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < arr.length - 1 && (
                      <span aria-hidden className="absolute left-5 top-11 h-[calc(100%-2.5rem)] w-px bg-slate-200" />
                    )}
                    <span className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">
                      {d.day}
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                        {t('itinerary.day', { day: d.day })}
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-900">{d.title}</p>
                      <ul className="mt-2 space-y-1.5">
                        {d.activities.map((a, idx) => (
                          <li key={`${d.day}-${idx}`} className="flex items-start gap-2 text-sm text-slate-600">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-emerald-700">{t('tourDetails.included')}</h2>
              <ul className="mt-3 space-y-2">
                {tour.includedServices.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{serviceLabel(s)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-red-600">{t('tourDetails.excluded')}</h2>
              <ul className="mt-3 space-y-2">
                {tour.excludedServices.map((s) => (
                  <li key={s} className="flex items-start gap-2 text-sm text-slate-600">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <span>{serviceLabel(s)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="mt-8 p-6">
            <h2 className="text-lg font-semibold text-slate-900">{t('tourDetails.reviews', { count: reviews.length })}</h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('tourDetails.noReviews')}</p>
            ) : (
              <div className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <div key={r.id} className="border-b border-slate-100 pb-4 last:border-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">{r.user?.name ?? t('tourDetails.travelerDefault')}</p>
                      <Stars value={r.rating} />
                    </div>
                    {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="lg:col-span-1">
          <Card className="p-6 lg:sticky lg:top-24">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">{t('tourDetails.from')}</p>
                <p className="text-3xl font-bold text-teal-700">{formatCurrency(tour.price)}</p>
                <p className="text-xs text-slate-500">{t('tourDetails.perGuest')}</p>
              </div>
              <FavoriteButton tourId={tour.id} />
            </div>
            <p className={`mt-3 text-sm font-medium ${tour.availableSeats <= 5 ? 'text-red-600' : 'text-emerald-600'}`}>
              {t('tourDetails.seatsAvailable', { count: tour.availableSeats })}
            </p>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Calendar className="h-4 w-4" /> {t('tourDetails.travelDate')}</span>
                <input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </label>
              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700"><Users className="h-4 w-4" /> {t('tourDetails.guests')}</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => setGuests(Math.max(tour.minGuests, guests - 1))} disabled={tour.availableSeats === 0} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40" aria-label={t('tourDetails.decreaseGuests')}>
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center font-bold">{guests}</span>
                  <button onClick={() => setGuests(Math.min(maxGuests, guests + 1))} disabled={tour.availableSeats === 0} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40" aria-label={t('tourDetails.increaseGuests')}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400">{t('tourDetails.guestsMinMax', { min: tour.minGuests, max: tour.maxGuests })}</p>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-4 text-sm">
                <span className="text-slate-500">{t('tourDetails.subtotal', { count: guests })}</span>
                <span className="font-bold text-slate-900">{formatCurrency(tour.price * guests)}</span>
              </div>
              <Button className="w-full bg-orange-500 py-3 hover:bg-orange-600 disabled:opacity-50" disabled={tour.availableSeats === 0} onClick={bookNow}>
                {tour.availableSeats === 0 ? t('tourDetails.soldOut') : t('tourDetails.bookNow')}
              </Button>
              <p className="text-center text-xs text-slate-400">{t('tourDetails.noCharge')}</p>
            </div>
          </Card>
        </aside>
      </div>

      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold text-slate-900">{t('tourDetails.related')}</h2>
          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3">
            {related.map((rel) => <TourCard key={rel.id} tour={rel} />)}
          </div>
        </div>
      )}
    </div>
  );
}
