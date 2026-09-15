import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { useEnumLabels } from '../../i18n/enums';
import { formatCurrency, type Pagination, type Tour, type TourItineraryDay } from '../../types';
import { Button, Card, Field, Input, Select } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

const empty = { title: '', departureLocation: '', destination: '', category: 'Beach', duration: '', price: 2000000, availableSeats: 20, featured: false, status: 'ACTIVE', description: '', images: '', transportation: [] as string[], includedServices: '', excludedServices: '' };

const TRANSPORT_MODES = ['Flight', 'Bus', 'Coach', 'PrivateCar', 'LocalTransfer', 'Cruise'];

const blankItinerary = (): TourItineraryDay[] => [{ day: 1, title: '', activities: [''] }];

function normalizeItinerary(days: TourItineraryDay[]): TourItineraryDay[] {
  return days.map((d, i) => ({ day: i + 1, title: d.title.trim(), activities: d.activities }));
}

/** Days encoded at the start of a duration string, e.g. "3 ngày 2 đêm" -> 3. */
function parseDurationDays(duration: string): number | null {
  const m = /^\s*(\d+)/.exec(duration ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 15 ? n : null;
}

export function ToursManage() {
  const { t } = useTranslation();
  const labels = useEnumLabels();
  const [tours, setTours] = useState<Tour[]>([]);
  const [editing, setEditing] = useState<Tour | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [itinerary, setItinerary] = useState<TourItineraryDay[]>(blankItinerary());
  const { register, handleSubmit, reset } = useForm({ defaultValues: empty });

  const load = (p: number = page) =>
    api
      .get('/admin/tours', { params: { page: p, limit: 10 } })
      .then((r) => {
        setTours(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch(() => toast.error(t('adminTours.loadFailed')));
  useEffect(() => { void load(page); }, [page]);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    reset(empty);
    setItinerary(blankItinerary());
  };
  const openEdit = (tour: Tour) => {
    setCreating(false);
    setEditing(tour);
    reset({
      title: tour.title, departureLocation: tour.departureLocation, destination: tour.destination, category: tour.category, duration: tour.duration,
      price: tour.price, availableSeats: tour.availableSeats, featured: tour.featured, status: tour.status,
      description: tour.description, images: tour.images.join('\n'),
      transportation: tour.transportation,
      includedServices: tour.includedServices.join('\n'),
      excludedServices: tour.excludedServices.join('\n'),
    });
    const days = Array.isArray(tour.itinerary) && tour.itinerary.length > 0 ? tour.itinerary : blankItinerary();
    setItinerary(normalizeItinerary(days.map((d) => ({ ...d, activities: d.activities.length > 0 ? [...d.activities] : [''] }))));
  };

  const splitLines = (v: string) => String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

  const submit = async (v: typeof empty & { category: string; status: string }) => {
    // Client-side itinerary validation (backend re-validates with zod + duration match).
    const days = normalizeItinerary(itinerary);
    for (const d of days) {
      if (!d.title) {
        toast.error(t('itinerary.titleRequired', { day: d.day }));
        return;
      }
      if (d.activities.length === 0 || d.activities.some((a) => !a.trim())) {
        toast.error(t('itinerary.activityRequired', { day: d.day }));
        return;
      }
    }
    const expectedDays = parseDurationDays(v.duration);
    if (expectedDays !== null && days.length !== expectedDays) {
      toast.error(t('itinerary.mismatchDays', { days: days.length, duration: v.duration }));
      return;
    }
    const payload = {
      title: v.title,
      departureLocation: v.departureLocation,
      destination: v.destination,
      category: v.category,
      duration: v.duration,
      price: Number(v.price),
      minGuests: 1,
      maxGuests: 20,
      availableSeats: Number(v.availableSeats),
      featured: Boolean(v.featured),
      status: v.status,
      description: v.description,
      images: splitLines(v.images),
      transportation: v.transportation,
      includedServices: splitLines(v.includedServices),
      excludedServices: splitLines(v.excludedServices),
      itinerary: days.map((d) => ({ day: d.day, title: d.title, activities: d.activities.map((a) => a.trim()) })),
    };
    try {
      if (editing) await api.patch(`/admin/tours/${editing.id}`, payload);
      else await api.post('/admin/tours', payload);
      toast.success(t('adminTours.saved'));
      setEditing(null);
      setCreating(false);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminTours.saveFailed')));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/tours/${id}`);
      toast.success(t('adminTours.deleted'));
      setDeleteId(null);
      // Step back if the last item of the page was removed.
      if (tours.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminTours.deleteFailed')));
      setDeleteId(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between">
        <p className="text-sm text-slate-500">{t('adminTours.count', { count: pagination?.total ?? tours.length })}</p>
        <Button onClick={openCreate}>{t('adminTours.newTour')}</Button>
      </div>

      {(creating || editing) && (
        <Card className="mt-4 p-6">
          <h2 className="font-semibold">{editing ? t('adminTours.editTour') : t('adminTours.newTour')}</h2>
          <form onSubmit={handleSubmit(submit)} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('adminTours.title')}><Input {...register('title', { required: true })} /></Field>
            <Field label={t('adminTours.departureLocation')}><Input {...register('departureLocation', { required: true })} placeholder="TP. Hồ Chí Minh" /></Field>
            <Field label={t('adminTours.destination')}><Input {...register('destination', { required: true })} /></Field>
            <Field label={t('adminTours.category')}>
              <Select {...register('category')}>
                {['Beach', 'Mountains', 'Culture', 'Relaxation'].map((c) => <option key={c} value={c}>{labels.category(c)}</option>)}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('adminTours.transportation')}</span>
              <div className="flex flex-wrap gap-3">
                {TRANSPORT_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="checkbox" value={m} {...register('transportation')} className="h-4 w-4 rounded border-slate-300 text-teal-600" />
                    {labels.transportation(m)}
                  </label>
                ))}
              </div>
            </div>
            <Field label={t('adminTours.duration')}><Input {...register('duration', { required: true })} placeholder={t('adminTours.durationPlaceholder')} /></Field>
            <Field label={t('adminTours.price')}><Input type="number" {...register('price', { valueAsNumber: true })} /></Field>
            <Field label={t('adminTours.seats')}><Input type="number" {...register('availableSeats', { valueAsNumber: true })} /></Field>
            <Field label={t('adminTours.status')}>
              <Select {...register('status')}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></Select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('featured')} /> {t('adminTours.featured')}</label>
            <div className="md:col-span-2"><Field label={t('adminTours.description')}><Input {...register('description', { required: true })} /></Field></div>
            <div className="md:col-span-2">
              <Field label={t('adminTours.images')}>
                <textarea {...register('images', { required: true })} rows={3} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label={`${t('adminTours.includedServices')} (${t('adminTours.servicesHint')})`}>
                <textarea {...register('includedServices', { required: true })} rows={4} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label={`${t('adminTours.excludedServices')} (${t('adminTours.servicesHint')})`}>
                <textarea {...register('excludedServices', { required: true })} rows={4} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{t('itinerary.title')}</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setItinerary((prev) => [...prev, { day: prev.length + 1, title: '', activities: [''] }])}
                >
                  + {t('itinerary.addDay')}
                </Button>
              </div>
              <div className="mt-3 space-y-4">
                {itinerary.map((d, di) => (
                  <div key={di} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-teal-700">{t('itinerary.day', { day: di + 1 })}</span>
                      <button
                        type="button"
                        disabled={itinerary.length <= 1}
                        onClick={() => setItinerary((prev) => prev.filter((_, i) => i !== di))}
                        className="text-sm font-semibold text-red-600 hover:underline disabled:opacity-40"
                      >
                        {t('itinerary.removeDay')}
                      </button>
                    </div>
                    <div className="mt-2">
                      <Field label={t('itinerary.dayTitle')}>
                        <Input
                          value={d.title}
                          placeholder={t('itinerary.dayTitlePlaceholder')}
                          onChange={(e) => setItinerary((prev) => prev.map((x, i) => (i === di ? { ...x, title: e.target.value } : x)))}
                        />
                      </Field>
                    </div>
                    <div className="mt-2 space-y-2">
                      {d.activities.map((a, ai) => (
                        <div key={ai} className="flex items-center gap-2">
                          <Input
                            value={a}
                            placeholder={t('itinerary.activityPlaceholder')}
                            onChange={(e) =>
                              setItinerary((prev) =>
                                prev.map((x, i) => (i === di ? { ...x, activities: x.activities.map((v, j) => (j === ai ? e.target.value : v)) } : x)),
                              )
                            }
                          />
                          <button
                            type="button"
                            disabled={d.activities.length <= 1}
                            onClick={() => setItinerary((prev) => prev.map((x, i) => (i === di ? { ...x, activities: x.activities.filter((_, j) => j !== ai) } : x)))}
                            className="shrink-0 rounded-xl border border-slate-200 px-2.5 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                            aria-label={t('itinerary.removeActivity')}
                          >
                            −
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setItinerary((prev) => prev.map((x, i) => (i === di ? { ...x, activities: [...x.activities, ''] } : x)))}
                        className="text-sm font-semibold text-teal-700 hover:underline"
                      >
                        + {t('itinerary.addActivity')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit">{t('adminTours.save')}</Button>
              <Button type="button" variant="secondary" onClick={() => { setEditing(null); setCreating(false); }}>{t('adminTours.cancel')}</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">{t('adminTours.title')}</th><th className="px-4 py-3">{t('adminTours.price')}</th><th className="px-4 py-3">{t('adminTours.seats')}</th><th className="px-4 py-3">{t('adminTours.status')}</th><th className="px-4 py-3 text-right">{t('admin.actions')}</th></tr>
          </thead>
          <tbody>
            {tours.map((tour) => (
              <tr key={tour.id} className="border-t border-slate-100">
                <td className="max-w-70 px-4 py-3"><p className="truncate font-medium">{tour.title}</p><p className="text-xs text-slate-400">{tour.departureLocation} → {tour.destination} · {labels.category(tour.category)}</p></td>
                <td className="px-4 py-3">{formatCurrency(tour.price)}</td>
                <td className="px-4 py-3">{tour.availableSeats}</td>
                <td className="px-4 py-3">{tour.status}{tour.featured ? ' ★' : ''}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(tour)} className="mr-3 font-semibold text-teal-700 hover:underline">{t('adminTours.edit')}</button>
                  <button onClick={() => setDeleteId(tour.id)} className="font-semibold text-red-600 hover:underline">{t('adminTours.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={deleteId !== null} title={t('adminTours.deleteTitle')} message={t('adminTours.deleteMessage')} confirmLabel={t('adminTours.deleteConfirm')} cancelLabel={t('adminTours.cancel')} onClose={() => setDeleteId(null)} onConfirm={() => deleteId && void remove(deleteId)} />
      <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
