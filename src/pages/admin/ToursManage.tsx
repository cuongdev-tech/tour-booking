import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { api, apiErrorMessage } from '../../services/api';
import { useEnumLabels } from '../../i18n/enums';
import { useDebounce } from '../../hooks/useDebounce';
import { formatCurrency, type Pagination, type Tour, type TourItineraryDay } from '../../types';
import { Button, Card, Field, Input, RowAction, Select, TableCard, TableEmpty, Td, Textarea, Th } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';
import { formatDateStr } from '../../i18n/format';

interface TourDateRow {
  id: string;
  tourId: string;
  date: string;
  capacity: number;
  booked: number;
  guideId?: string | null;
  vehicleId?: string | null;
  guide?: { id: string; name: string } | null;
  vehicle?: { id: string; plate: string; seats: number } | null;
}

const empty = { title: '', departureLocation: '', destination: '', category: 'Beach', duration: '', price: 2000000, childPrice: NaN, childMaxAge: NaN, freeCancelHours: NaN, departureHour: NaN, minGuests: 1, maxGuests: 20, availableSeats: 20, featured: false, status: 'ACTIVE', description: '', images: '', transportation: [] as string[], includedServices: '', excludedServices: '' };

const TRANSPORT_MODES = ['Flight', 'Bus', 'Coach', 'PrivateCar', 'LocalTransfer', 'Cruise'];

interface AddonDraft { name: string; price: number; perPerson: boolean; }

const blankAddons = (): AddonDraft[] => [];

/** Stable add-on ids derived from names (snapshots in bookings keep working). */
function slugifyAddon(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[đ]/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'addon';
  let id = base;
  let n = 1;
  while (taken.has(id)) {
    n += 1;
    id = `${base}-${n}`;
  }
  taken.add(id);
  return id;
}

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
  const [qInput, setQInput] = useState('');
  const q = useDebounce(qInput, 300);
  const [itinerary, setItinerary] = useState<TourItineraryDay[]>(blankItinerary());
  const [addons, setAddons] = useState<AddonDraft[]>(blankAddons());
  interface TierDraft { minGuests: number; price: number; childPrice: number; }
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [privateAvailable, setPrivateAvailable] = useState(false);
  const [privateSurcharge, setPrivateSurcharge] = useState(0);
  const [tourDates, setTourDates] = useState<TourDateRow[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newCapacity, setNewCapacity] = useState(20);
  const [newGuideId, setNewGuideId] = useState('');
  const [newVehicleId, setNewVehicleId] = useState('');
  const [guides, setGuides] = useState<Array<{ id: string; name: string }>>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; plate: string; seats: number }>>([]);
  const [deleteDateId, setDeleteDateId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const { register, handleSubmit, reset } = useForm({ defaultValues: empty });

  const load = (p: number = page, keyword: string = q) =>
    api
      .get('/admin/tours', { params: { page: p, limit: 10, ...(keyword.trim() ? { q: keyword.trim() } : {}) } })
      .then((r) => {
        setTours(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => toast.error(apiErrorMessage(err, t('adminTours.loadFailed'))));
  // When the keyword changes, reset to page 1 (which triggers the load below).
  // When already on page 1, load directly — never fire both with a stale page.
  // The first run is skipped: the page effect covers the initial mount.
  const firstQ = useRef(true);
  useEffect(() => {
    if (firstQ.current) {
      firstQ.current = false;
      return;
    }
    if (page === 1) void load(1, q);
    else setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => { void load(page, q); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page]);

  const openCreate = () => {
    setEditing(null);
    editingIdRef.current = null;
    setCreating(true);
    reset(empty);
    setItinerary(blankItinerary());
    setAddons(blankAddons());
    setTiers([]);
    setPrivateAvailable(false);
    setPrivateSurcharge(0);
    setTourDates([]);
    setNewGuideId('');
    setNewVehicleId('');
  };
  const loadTourDates = async (tourId: string) => {
    try {
      const { data } = await api.get(`/admin/tours/${tourId}/dates`);
      // Stale guard: ignore the response if the admin already opened another tour.
      if (editingIdRef.current === tourId) setTourDates(data.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminTours.loadFailed')));
    }
    try {
      const [g, v] = await Promise.all([api.get('/admin/guides'), api.get('/admin/vehicles')]);
      setGuides(g.data.data);
      setVehicles(v.data.data);
    } catch {
      /* fleet optional */
    }
  };
  const openEdit = (tour: Tour) => {
    setCreating(false);
    setEditing(tour);
    editingIdRef.current = tour.id;
    setTourDates([]);
    setNewDate('');
    setNewCapacity(20);
    setNewGuideId('');
    setNewVehicleId('');
    void loadTourDates(tour.id);
    reset({
      title: tour.title, departureLocation: tour.departureLocation, destination: tour.destination, category: tour.category, duration: tour.duration,
      price: tour.price, childPrice: tour.childPrice ?? NaN, childMaxAge: tour.childMaxAge ?? NaN, freeCancelHours: tour.freeCancelHours ?? NaN,
      departureHour: tour.departureHour ?? NaN,
      minGuests: tour.minGuests, maxGuests: tour.maxGuests, availableSeats: tour.availableSeats, featured: tour.featured, status: tour.status,
      description: tour.description, images: tour.images.join('\n'),
      transportation: tour.transportation,
      includedServices: tour.includedServices.join('\n'),
      excludedServices: tour.excludedServices.join('\n'),
    });
    setAddons(
      (Array.isArray(tour.addons) ? tour.addons : []).map((a) => ({
        name: String(a?.name ?? ''),
        price: Number(a?.price) || 0,
        perPerson: Boolean(a?.perPerson),
      })),
    );
    setTiers(
      (Array.isArray(tour.priceTiers) ? tour.priceTiers : []).map((tier) => ({
        minGuests: Number(tier?.minGuests) || 1,
        price: Number(tier?.price) || 0,
        childPrice: Number(tier?.childPrice) || 0,
      })),
    );
    setPrivateAvailable(Boolean(tour.privateAvailable));
    setPrivateSurcharge(Number(tour.privateSurcharge) || 0);
    const days = Array.isArray(tour.itinerary) && tour.itinerary.length > 0 ? tour.itinerary : blankItinerary();
    setItinerary(normalizeItinerary(days.map((d) => ({ ...d, activities: d.activities.length > 0 ? [...d.activities] : [''] }))));
  };

  const splitLines = (v: string) => String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

  const addTourDate = async () => {
    if (!editing || !newDate) return;
    try {
      await api.post(`/admin/tours/${editing.id}/dates`, {
        date: newDate,
        capacity: Number(newCapacity) || 1,
        guideId: newGuideId || null,
        vehicleId: newVehicleId || null,
      });
      toast.success(t('adminTours.saved'));
      setNewDate('');
      setNewGuideId('');
      setNewVehicleId('');
      await loadTourDates(editing.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminTours.saveFailed')));
    }
  };

  const removeTourDate = async (dateId: string) => {
    if (!editing) return;
    try {
      await api.delete(`/admin/tours/dates/${dateId}`);
      toast.success(t('adminTours.deleted'));
      setDeleteDateId(null);
      await loadTourDates(editing.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminTours.deleteFailed')));
      setDeleteDateId(null);
    }
  };

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
    const price = Number(v.price);
    const seats = Number(v.availableSeats);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(seats) || seats < 0) {
      toast.error(t('adminTours.saveFailed'));
      return;
    }
    // Child pricing: empty = no child tickets. NaN renders as empty input.
    const childPriceRaw = Number(v.childPrice);
    const hasChildPrice = Number.isFinite(childPriceRaw) && childPriceRaw > 0;
    const childPrice = hasChildPrice ? Math.floor(childPriceRaw) : null;
    // Clearing the price also clears the age (backend requires age => price).
    const childMaxAgeRaw = Number(v.childMaxAge);
    const childMaxAge =
      hasChildPrice && Number.isFinite(childMaxAgeRaw) && childMaxAgeRaw >= 1 ? Math.floor(childMaxAgeRaw) : null;
    if (childPrice !== null && childPrice >= price) {
      toast.error(t('adminTours.saveFailed'));
      return;
    }
    if (childMaxAge !== null && childPrice === null) {
      toast.error(t('adminTours.saveFailed'));
      return;
    }
    const freeCancelRaw = Number(v.freeCancelHours);
    const freeCancelHours = Number.isFinite(freeCancelRaw) && freeCancelRaw >= 1 ? Math.floor(freeCancelRaw) : null;
    // Tiered group pricing: ascending unique thresholds, positive prices.
    const tierPayload = tiers
      .map((tier) => ({
        minGuests: Math.floor(Number(tier.minGuests)),
        price: Math.floor(Number(tier.price)),
        ...(Number(tier.childPrice) > 0 ? { childPrice: Math.floor(Number(tier.childPrice)) } : {}),
      }))
      .filter((tier) => Number.isFinite(tier.minGuests) && tier.minGuests >= 1 && Number.isFinite(tier.price) && tier.price > 0)
      .sort((a, b) => a.minGuests - b.minGuests)
      .filter((tier, i, arr) => i === 0 || tier.minGuests !== arr[i - 1].minGuests);
    for (const tier of tierPayload) {
      if (tier.childPrice != null && tier.childPrice >= tier.price) {
        toast.error(t('adminTours.saveFailed'));
        return;
      }
    }
    const surcharge = Math.max(0, Math.floor(Number(privateSurcharge)) || 0);
    const depHourRaw = Number((v as { departureHour?: unknown }).departureHour);
    const departureHour = Number.isFinite(depHourRaw) && depHourRaw >= 0 && depHourRaw <= 23 ? Math.floor(depHourRaw) : null;
    // Add-ons: ids derived from names (stable across edits while names stay).
    const taken = new Set<string>();
    const addonPayload: Array<{ id: string; name: string; price: number; perPerson: boolean }> = [];
    for (const a of addons) {
      const name = a.name.trim();
      const ap = Math.floor(Number(a.price));
      if (!name || name.length < 2 || !Number.isFinite(ap) || ap <= 0) {
        toast.error(t('adminTours.saveFailed'));
        return;
      }
      addonPayload.push({ id: slugifyAddon(name, taken), name, price: ap, perPerson: Boolean(a.perPerson) });
    }
    const payload = {
      title: v.title,
      departureLocation: v.departureLocation,
      destination: v.destination,
      category: v.category,
      duration: v.duration,
      price,
      childPrice,
      childMaxAge,
      freeCancelHours,
      departureHour,
      priceTiers: tierPayload,
      privateAvailable,
      privateSurcharge: privateAvailable ? surcharge : 0,
      addons: addonPayload,
      minGuests: Math.max(1, Number(v.minGuests) || 1),
      maxGuests: Math.max(Number(v.minGuests) || 1, Number(v.maxGuests) || 20),
      availableSeats: seats,
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
      editingIdRef.current = null;
      setCreating(false);
      await load();
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
      else await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminTours.deleteFailed')));
      setDeleteId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('adminTours.count', { count: pagination?.total ?? tours.length })}</p>
        <div className="flex items-center gap-2">
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={t('tours.searchPlaceholder')}
              aria-label={t('tours.search')}
              className="w-52 pl-9"
            />
          </span>
          <Button onClick={openCreate}>{t('adminTours.newTour')}</Button>
        </div>
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
                  <label key={m} className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-1 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-orange-700">
                    <input type="checkbox" value={m} {...register('transportation')} className="h-4 w-4 rounded border-slate-300 accent-orange-700" />
                    {labels.transportation(m)}
                  </label>
                ))}
              </div>
            </div>
            <Field label={t('adminTours.duration')}><Input {...register('duration', { required: true })} placeholder={t('adminTours.durationPlaceholder')} /></Field>
            <Field label={t('adminTours.price')}><Input type="number" {...register('price', { valueAsNumber: true })} /></Field>
            <Field label={t('adminTours.childPrice', { defaultValue: 'Giá trẻ em (trống = không bán)' }) as string} hint={t('adminTours.childPriceHint', { defaultValue: 'Phải thấp hơn giá người lớn' }) as string}>
              <Input type="number" min={1} {...register('childPrice', { valueAsNumber: true })} />
            </Field>
            <Field label={t('adminTours.childMaxAge', { defaultValue: 'Tuổi tối đa vé TE' }) as string}>
              <Input type="number" min={1} max={17} {...register('childMaxAge', { valueAsNumber: true })} />
            </Field>
            <Field label={t('adminTours.freeCancelHours', { defaultValue: 'Hủy miễn phí trước (giờ)' }) as string} hint={t('adminTours.freeCancelHint', { defaultValue: 'Trống = linh hoạt đến ngày đi' }) as string}>
              <Input type="number" min={1} max={720} {...register('freeCancelHours', { valueAsNumber: true })} />
            </Field>
            <Field label="Giờ khởi hành (0-23)" hint="Để sort giờ KH sớm nhất">
              <Input type="number" min={0} max={23} {...register('departureHour', { valueAsNumber: true })} />
            </Field>
            <Field label={t('adminTours.minGuests')}><Input type="number" min={1} {...register('minGuests', { valueAsNumber: true })} /></Field>
            <Field label={t('adminTours.maxGuests')}><Input type="number" min={1} max={100} {...register('maxGuests', { valueAsNumber: true })} /></Field>
            <Field label={t('adminTours.seats')}><Input type="number" {...register('availableSeats', { valueAsNumber: true })} /></Field>
            <div className="md:col-span-2 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Giá theo đoàn (tùy chọn)</span>
                <Button type="button" variant="secondary" onClick={() => setTiers((prev) => [...prev, { minGuests: 4, price: 0, childPrice: 0 }])}>
                  + Thêm mốc
                </Button>
              </div>
              {tiers.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">Trống = dùng giá chuẩn cho mọi số khách.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {tiers.map((tier, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-500">Từ (khách)</span>
                        <Input type="number" min={1} value={tier.minGuests} onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, minGuests: Number(e.target.value) } : x)))} className="w-24" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-500">Giá NL</span>
                        <Input type="number" min={1} value={tier.price || ''} onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} className="w-32" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-500">Giá TE (trống = chung)</span>
                        <Input type="number" min={0} value={tier.childPrice || ''} onChange={(e) => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, childPrice: Number(e.target.value) } : x)))} className="w-32" />
                      </label>
                      <Button type="button" variant="ghost" onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}>Xóa</Button>
                    </div>
                  ))}
                </div>
              )}
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={privateAvailable} onChange={(e) => setPrivateAvailable(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-orange-700" />
                Cho đi riêng đoàn
              </label>
              {privateAvailable && (
                <div className="mt-2 max-w-56">
                  <Field label="Phụ thu đi riêng (VND)">
                    <Input type="number" min={0} value={privateSurcharge || ''} onChange={(e) => setPrivateSurcharge(Number(e.target.value))} />
                  </Field>
                </div>
              )}
            </div>
            {editing && (
              <div className="md:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('adminTours.dates')}</span>
                <div className="space-y-2">
                  {tourDates.length === 0 && (
                    <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{t('tours.emptyTitle')}</p>
                  )}
                  {tourDates.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <span className="tabular-nums text-slate-900">{formatDateStr(d.date)}</span>
                      <span className="text-xs text-slate-500">{d.guide?.name ?? '—'} · {d.vehicle ? `${d.vehicle.plate} (${d.vehicle.seats})` : '—'}</span>
                      <span className="flex items-center gap-2 text-xs tabular-nums text-slate-500">
                        {d.booked}/{d.capacity}
                        <RowAction tone="red" onClick={() => setDeleteDateId(d.id)}>{t('adminTours.delete')}</RowAction>
                      </span>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">{t('tourDetails.travelDate')}</span>
                      <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-auto" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">{t('adminTours.capacity')}</span>
                      <Input type="number" min={1} value={newCapacity} onChange={(e) => setNewCapacity(Number(e.target.value))} className="w-24" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">HDV</span>
                      <Select value={newGuideId} onChange={(e) => setNewGuideId(e.target.value)} className="w-36">
                        <option value="">—</option>
                        {guides.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </Select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">Xe</span>
                      <Select value={newVehicleId} onChange={(e) => setNewVehicleId(e.target.value)} className="w-36">
                        <option value="">—</option>
                        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} ({v.seats})</option>)}
                      </Select>
                    </label>
                    <Button type="button" variant="secondary" onClick={() => void addTourDate()} disabled={!newDate}>
                      {t('adminTours.addDate')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <Field label={t('adminTours.status')}>
              <Select {...register('status')}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></Select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('featured')} /> {t('adminTours.featured')}</label>
            <div className="md:col-span-2"><Field label={t('adminTours.description')}><Textarea {...register('description', { required: true })} rows={2} /></Field></div>
            <div className="md:col-span-2">
              <Field label={t('adminTours.images')}>
                <Textarea {...register('images', { required: true })} rows={3} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label={`${t('adminTours.includedServices')} (${t('adminTours.servicesHint')})`}>
                <Textarea {...register('includedServices', { required: true })} rows={4} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label={`${t('adminTours.excludedServices')} (${t('adminTours.servicesHint')})`}>
                <Textarea {...register('excludedServices', { required: true })} rows={4} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  {t('adminTours.addons', { defaultValue: 'Dịch vụ bổ sung' }) as string}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAddons((prev) => [...prev, { name: '', price: 100000, perPerson: true }])}
                >
                  + {t('adminTours.addAddon', { defaultValue: 'Thêm dịch vụ' }) as string}
                </Button>
              </div>
              {addons.length === 0 ? (
                <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  {t('adminTours.noAddons', { defaultValue: 'Chưa có dịch vụ bổ sung — khách chỉ trả tiền tour.' }) as string}
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {addons.map((a, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <label className="min-w-40 flex-1">
                        <span className="mb-1 block text-xs font-medium text-slate-500">
                          {t('adminTours.addonName', { defaultValue: 'Tên dịch vụ' }) as string}
                        </span>
                        <Input
                          value={a.name}
                          onChange={(e) => setAddons((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                          placeholder={t('adminTours.addonNamePh', { defaultValue: 'VD: Xe đón riêng' }) as string}
                        />
                      </label>
                      <label className="block w-36">
                        <span className="mb-1 block text-xs font-medium text-slate-500">
                          {t('adminTours.price')}
                        </span>
                        <Input
                          type="number"
                          min={1}
                          value={Number.isFinite(a.price) ? a.price : ''}
                          onChange={(e) => setAddons((prev) => prev.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))}
                        />
                      </label>
                      <label className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={a.perPerson}
                          onChange={(e) => setAddons((prev) => prev.map((x, j) => (j === i ? { ...x, perPerson: e.target.checked } : x)))}
                          className="h-4 w-4 rounded border-slate-300 accent-orange-700"
                        />
                        {t('adminTours.perPerson', { defaultValue: 'Tính theo khách' }) as string}
                      </label>
                      <RowAction tone="red" onClick={() => setAddons((prev) => prev.filter((_, j) => j !== i))}>
                        {t('adminTours.delete')}
                      </RowAction>
                    </div>
                  ))}
                </div>
              )}
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
                      <span className="text-sm font-semibold text-orange-700">{t('itinerary.day', { day: di + 1 })}</span>
                      <RowAction
                        tone="red"
                        disabled={itinerary.length <= 1}
                        onClick={() => setItinerary((prev) => prev.filter((_, i) => i !== di))}
                      >
                        {t('itinerary.removeDay')}
                      </RowAction>
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
                            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={t('itinerary.removeActivity')}
                          >
                            <span aria-hidden>−</span>
                          </button>
                        </div>
                      ))}
                      <RowAction
                        type="button"
                        onClick={() => setItinerary((prev) => prev.map((x, i) => (i === di ? { ...x, activities: [...x.activities, ''] } : x)))}
                      >
                        + {t('itinerary.addActivity')}
                      </RowAction>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit">{t('adminTours.save')}</Button>
              <Button type="button" variant="secondary" onClick={() => { setEditing(null); editingIdRef.current = null; setCreating(false); }}>{t('adminTours.cancel')}</Button>
            </div>
          </form>
        </Card>
      )}

      <TableCard>
        <table className="w-full min-w-180 text-left">
          <thead className="bg-slate-50">
            <tr><Th>{t('adminTours.title')}</Th><Th>{t('adminTours.price')}</Th><Th>{t('adminTours.seats')}</Th><Th>{t('adminTours.status')}</Th><Th right>{t('admin.actions')}</Th></tr>
          </thead>
          <tbody>
            {tours.length === 0 && (
              <TableEmpty colSpan={5}>{t('tours.emptyTitle')}</TableEmpty>
            )}
            {tours.map((tour) => (
              <tr key={tour.id} className="transition-colors hover:bg-slate-50/60">
                <Td className="max-w-70"><p className="truncate font-medium text-slate-900">{tour.title}{tour.featured ? ' ★' : ''}</p><p className="mt-0.5 truncate text-xs text-slate-400">{tour.departureLocation} → {tour.destination} · {labels.category(tour.category)}</p></Td>
                <Td className="tabular-nums">{formatCurrency(tour.price)}</Td>
                <Td className="tabular-nums">{tour.availableSeats}</Td>
                <Td>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tour.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {tour.status === 'ACTIVE' ? t('adminTours.active') : t('adminTours.inactive')}
                  </span>
                </Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <RowAction onClick={() => openEdit(tour)}>{t('adminTours.edit')}</RowAction>
                    <RowAction tone="red" onClick={() => setDeleteId(tour.id)}>{t('adminTours.delete')}</RowAction>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <ConfirmDialog open={deleteId !== null} title={t('adminTours.deleteTitle')} message={t('adminTours.deleteMessage')} confirmLabel={t('adminTours.deleteConfirm')} cancelLabel={t('adminTours.cancel')} onClose={() => setDeleteId(null)} onConfirm={() => deleteId && void remove(deleteId)} />
      <ConfirmDialog open={deleteDateId !== null} title={t('adminTours.deleteDateTitle')} message={t('adminTours.deleteDateMessage')} confirmLabel={t('adminTours.deleteConfirm')} cancelLabel={t('adminTours.cancel')} onClose={() => setDeleteDateId(null)} onConfirm={() => deleteDateId && void removeTourDate(deleteDateId)} />
      <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
