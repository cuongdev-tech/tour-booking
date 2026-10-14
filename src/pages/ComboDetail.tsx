import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, type Combo, type Tour } from '../types';
import { Badge, Button, EmptyState, Field, Input, PageContainer, QuantityStepper, RetryState, SafeImage, SectionHeader, Skeleton } from '../components/ui/kit';
import { TourCard } from '../components/tour/TourCard';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { todayUtcInput } from '../utils/date';

interface ComboDetailResponse {
  combo: Combo;
  tours: Tour[];
  tourTotal: number;
  discountAmount: number;
  comboTotal: number;
}

export function ComboDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<ComboDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [booking, setBooking] = useState(false);
  const [travelDate, setTravelDate] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(2);
  const [legs, setLegs] = useState<Array<{ bookingCode: string }>>([]);
  useDocumentMeta(data?.combo.title ?? 'Combo');

  useEffect(() => {
    if (user?.phone) setPhone(user.phone);
  }, [user?.phone]);

  const load = () => {
    if (!slug) return;
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    api
      .get(`/combos/${slug}`, { signal: ctrl.signal })
      .then((r) => setData(r.data))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setFailed(true);
        toast.error(apiErrorMessage(err, 'Không tải được combo'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  };

  useEffect(() => {
    const cleanup = load();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const bookCombo = async () => {
    if (!data) return;
    if (!user) {
      toast.error('Vui lòng đăng nhập để đặt combo');
      navigate('/login');
      return;
    }
    if (user.role === 'ADMIN') {
      toast.error('Tài khoản quản trị không thể đặt tour, hãy dùng tài khoản khách hàng');
      navigate('/admin/bookings');
      return;
    }
    if ((user.emailVerified ?? false) === false) {
      toast.error('Bạn cần xác thực email trước khi đặt tour.');
      navigate('/verify-email');
      return;
    }
    if (!travelDate) {
      toast.error('Vui lòng chọn ngày đi (áp dụng cho mọi chặng)');
      return;
    }
    const cleanPhone = phone.trim() || (user.phone ?? '');
    if (!/^[0-9+\s-]{8,20}$/.test(cleanPhone) || (cleanPhone.match(/[0-9]/g) ?? []).length < 6) {
      toast.error('Số điện thoại chưa hợp lệ');
      return;
    }
    setBooking(true);
    try {
      // Body giống booking thường nhưng KHÔNG có tourId — backend tách thành nhiều legs.
      const { data: res } = await api.post(`/combos/${data.combo.id}/book`, {
        travelDate: new Date(travelDate).toISOString(),
        customerName: user.name,
        customerEmail: user.email,
        customerPhone: cleanPhone,
        paymentMethod: 'BANK_TRANSFER',
        guestsList: Array.from({ length: guests }, (_, i) => ({
          fullName: i === 0 ? user.name : `Khách ${i + 1}`,
          isChild: false,
        })),
      });
      const booked = (res.bookings as Array<{ id: string; bookingCode: string }>) ?? [];
      setLegs(booked);
      const first = booked[0];
      toast.success(`Đã đặt combo ${booked.length} chặng${res.group ? ` (nhóm ${res.group})` : ''}`);
      if (first) navigate(`/booking-success/${first.bookingCode}`, { state: { fresh: true } });
      else navigate('/bookings');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Đặt combo thất bại'));
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <PageContainer className="py-8 md:py-10">
        <Skeleton className="h-64" />
        <Skeleton className="mt-4 h-40" />
      </PageContainer>
    );
  }
  if (failed || !data) {
    return (
      <PageContainer className="py-8 md:py-10">
        {failed ? (
          <RetryState title="Không tải được combo" onRetry={load} retryLabel="Thử lại" />
        ) : (
          <EmptyState title="Không tìm thấy combo" action={<Link to="/combos"><Button>Về Combos</Button></Link>} />
        )}
      </PageContainer>
    );
  }

  const { combo, tours, tourTotal, discountAmount, comboTotal } = data;

  return (
    <PageContainer className="py-8 md:py-10">
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm text-slate-500">
        <Link to="/combos" className="rounded hover:text-orange-700">Combos</Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate font-medium text-slate-900">{combo.title}</span>
      </nav>
      <div className="mt-4 flex flex-wrap items-start gap-2">
        <h1 className="max-w-3xl flex-1 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{combo.title}</h1>
        {combo.discountPercent > 0 && <Badge className="bg-red-600 text-white">-{combo.discountPercent}%</Badge>}
      </div>
      {combo.description && <p className="mt-3 max-w-3xl leading-relaxed text-slate-600">{combo.description}</p>}
      {combo.images?.[0] && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200/70">
          <SafeImage src={combo.images[0]} alt={combo.title} eager className="max-h-105 w-full object-cover" />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SectionHeader title={`Các tour trong combo (${tours.length})`} />
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {tours.map((t) => <TourCard key={t.id} tour={t} />)}
          </div>
        </div>
        <aside className="lg:sticky lg:top-24">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
            <h2 className="font-bold tracking-tight text-slate-900">Tổng thanh toán</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Tổng các tour</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{formatCurrency(tourTotal)}</dd>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Giảm combo ({combo.discountPercent}%)</dt>
                  <dd className="font-semibold tabular-nums text-emerald-600">-{formatCurrency(discountAmount)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <dt className="font-semibold text-slate-900">Combo total</dt>
                <dd className="text-xl font-bold tabular-nums text-orange-700">{formatCurrency(comboTotal)}</dd>
              </div>
            </dl>
            <Button className="mt-5 w-full" isLoading={booking} onClick={() => void bookCombo()}>
              Đặt combo ({tours.length} chặng)
            </Button>
            <div className="mt-4 space-y-3">
              <Field label="Ngày đi (áp dụng mọi chặng)">
                <Input type="date" value={travelDate} min={todayUtcInput()} onChange={(e) => setTravelDate(e.target.value)} />
              </Field>
              <Field label="Số điện thoại">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={user?.phone ?? '0901234567'} inputMode="tel" />
              </Field>
              <div>
                <span id="combo-guests-label" className="mb-1 block text-xs font-medium text-slate-500">Số khách (mỗi chặng)</span>
                <QuantityStepper
                  value={guests}
                  min={1}
                  max={10}
                  onChange={(n) => setGuests(Math.min(Math.max(n, 1), 10))}
                  decreaseLabel="Giảm khách"
                  increaseLabel="Thêm khách"
                  labelledBy="combo-guests-label"
                />
              </div>
            </div>
            {legs.length > 0 && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm">
                <p className="font-semibold text-emerald-800">Các chặng đã đặt:</p>
                <ul className="mt-1 space-y-1">
                  {legs.map((leg) => (
                    <li key={leg.bookingCode}>
                      <Link to={`/booking-success/${leg.bookingCode}`} className="font-mono font-bold text-orange-700 hover:underline">
                        {leg.bookingCode}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-center text-xs text-slate-400">Mỗi chặng là một booking riêng, thanh toán như booking thường.</p>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
