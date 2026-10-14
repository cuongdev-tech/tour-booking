import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatMoney } from '../../i18n/format';
import type { Coupon, Pagination } from '../../types';
import { Button, Card, Field, Input, RetryState, RowAction, Select, Skeleton, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

const empty = { code: '', type: 'PERCENT', value: 10, minOrder: 1000000, expiresAt: '', usageLimit: 100, active: true, applicableTourIds: '', applicableCategory: '', startsAt: '', maxDiscount: NaN as number, minGuests: 0 };

/** Local YYYY-MM-DD for <input type="date"> (prefer the date part verbatim — new Date() shifts the day in +07). */
function toLocalDateInput(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (m) return m[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CouponsManage() {
  const { t } = useTranslation();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const { register, handleSubmit, reset } = useForm({ defaultValues: empty });

  const load = (p: number = page) => {
    setLoading(true);
    setLoadFailed(false);
    api
      .get('/admin/coupons', { params: { page: p, limit: 10 } })
      .then((r) => {
        setCoupons(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch((err) => {
        setLoadFailed(true);
        toast.error(apiErrorMessage(err, t('adminCoupons.loadFailed')));
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { void load(page); }, [page]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
    reset(empty);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setShowForm(true);
    reset({
      code: c.code,
      type: c.type,
      value: c.value,
      minOrder: c.minOrder,
      expiresAt: toLocalDateInput(c.expiresAt),
      // NaN renders as an empty input and submits back as unlimited (null).
      usageLimit: c.usageLimit ?? NaN,
      active: c.active,
      applicableTourIds: (c.applicableTourIds ?? []).join(', '),
      applicableCategory: c.applicableCategory ?? '',
      startsAt: c.startsAt ? toLocalDateInput(c.startsAt) : '',
      maxDiscount: c.maxDiscount ?? NaN,
      minGuests: c.minGuests ?? 0,
    });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const submit = async (v: typeof empty & { type: string }) => {
    try {
      // Send the date-only string untouched: the backend treats YYYY-MM-DD as
      // valid through the end of that day (a full ISO would expire at 00:00 UTC).
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.expiresAt)) throw new Error('Invalid expiry date');
      const value = Number(v.value);
      const minOrder = Number(v.minOrder);
      if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(minOrder) || minOrder < 0) {
        throw new Error('Invalid numbers');
      }
      const usageLimit = Number(v.usageLimit);
      const maxDisc = Number((v as { maxDiscount?: unknown }).maxDiscount);
      const minG = Number((v as { minGuests?: unknown }).minGuests);
      const payload = {
        ...(editing ? {} : { code: v.code }),
        type: v.type,
        value,
        minOrder,
        expiresAt: v.expiresAt,
        usageLimit: Number.isNaN(usageLimit) ? null : usageLimit,
        active: v.active,
        applicableTourIds: String((v as { applicableTourIds?: unknown }).applicableTourIds ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        applicableCategory: ((v as { applicableCategory?: string }).applicableCategory || null) as string | null,
        startsAt: ((v as { startsAt?: string }).startsAt || null) as string | null,
        maxDiscount: Number.isFinite(maxDisc) && maxDisc > 0 ? maxDisc : null,
        minGuests: Number.isFinite(minG) && minG > 0 ? Math.floor(minG) : 0,
      };
      if (editing) {
        await api.patch(`/admin/coupons/${editing.id}`, payload);
        toast.success(t('adminCoupons.updated'));
      } else {
        await api.post('/admin/coupons', payload);
        toast.success(t('adminCoupons.created'));
      }
      closeForm();
      reset();
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, editing ? t('adminCoupons.updateFailed') : t('adminCoupons.createFailed')));
    }
  };

  const toggle = async (c: Coupon) => {
    try {
      await api.patch(`/admin/coupons/${c.id}`, { active: !c.active });
      toast.success(t('adminCoupons.updated'));
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminCoupons.updateFailed')));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/coupons/${id}`);
      toast.success(t('adminCoupons.deleted'));
      setDeleteId(null);
      // Step back if the last item of the page was removed.
      if (coupons.length === 1 && page > 1) setPage(page - 1);
      else load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminCoupons.deleteFailed')));
      setDeleteId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('adminCoupons.count', { count: pagination?.total ?? coupons.length })}</p>
        <Button onClick={openCreate}>{t('adminCoupons.newCoupon')}</Button>
      </div>
      {showForm && (
        <Card className="mt-4 p-6">
          <h2 className="font-semibold">{editing ? t('adminCoupons.editCoupon') : t('adminCoupons.newCoupon')}</h2>
          <form onSubmit={handleSubmit(submit)} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t('adminCoupons.code')}>
              <Input {...register('code', { required: true })} placeholder={t('adminCoupons.codePlaceholder')} disabled={!!editing} />
            </Field>
            <Field label={t('adminCoupons.type')}>
              <Select {...register('type')}><option value="PERCENT">PERCENT</option><option value="FIXED">FIXED</option></Select>
            </Field>
            <Field label={t('adminCoupons.value')}><Input type="number" {...register('value', { valueAsNumber: true })} /></Field>
            <Field label={t('adminCoupons.minOrder')}><Input type="number" {...register('minOrder', { valueAsNumber: true })} /></Field>
            <Field label={t('adminCoupons.expiresAt')}><Input type="date" {...register('expiresAt', { required: true })} /></Field>
            <Field label={t('adminCoupons.usageLimit')} hint={t('adminCoupons.unlimited')}><Input type="number" {...register('usageLimit', { valueAsNumber: true })} /></Field>
            <Field label="Ngày bắt đầu (flash sale)"><Input type="date" {...register('startsAt')} /></Field>
            <Field label="Trần giảm (PERCENT)"><Input type="number" {...register('maxDiscount', { valueAsNumber: true })} /></Field>
            <Field label="Tối thiểu khách (combo)"><Input type="number" min={0} {...register('minGuests', { valueAsNumber: true })} /></Field>
            <Field label="Áp dụng tour (IDs, phẩy)"><Input {...register('applicableTourIds')} placeholder="để trống = all" /></Field>
            <Field label="Áp dụng hạng mục">
              <Select {...register('applicableCategory')}>
                <option value="">Tất cả</option>
                <option value="Beach">Beach</option>
                <option value="Mountains">Mountains</option>
                <option value="Culture">Culture</option>
                <option value="Relaxation">Relaxation</option>
              </Select>
            </Field>
            <div className="flex items-end gap-2 md:col-span-3">
              <Button type="submit">{editing ? t('adminCoupons.update') : t('adminCoupons.create')}</Button>
              <Button type="button" variant="secondary" onClick={closeForm}>{t('adminCoupons.cancel')}</Button>
            </div>
          </form>
        </Card>
      )}
      <TableCard>
        {loading && coupons.length === 0 ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : loadFailed && coupons.length === 0 ? (
          <RetryState title={t('adminCoupons.loadFailed')} onRetry={() => load()} retryLabel={t('common.retry')} />
        ) : (
          <table className="w-full min-w-220 text-left">
          <thead className="bg-slate-50">
            <tr><Th>{t('adminCoupons.code')}</Th><Th>{t('adminCoupons.value')}</Th><Th>{t('adminCoupons.minOrder')}</Th><Th>{t('adminCoupons.expiresAt')}</Th><Th>{t('adminCoupons.used')}</Th><Th>{t('adminCoupons.active')}</Th><Th right>{t('admin.actions')}</Th></tr>
          </thead>
          <tbody>
            {coupons.length === 0 && (
              <TableEmpty colSpan={7}>{t('tours.emptyTitle')}</TableEmpty>
            )}
            {coupons.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-slate-50/60">
                <Td className="font-mono font-bold text-slate-900">{c.code}</Td>
                <Td className="tabular-nums">{c.type === 'PERCENT' ? `${c.value}%` : formatMoney(c.value)}</Td>
                <Td className="tabular-nums">{formatMoney(c.minOrder)}</Td>
                <Td className="whitespace-nowrap tabular-nums">{toLocalDateInput(c.expiresAt)}</Td>
                <Td className="tabular-nums">{c.usedCount}{c.usageLimit ? `/${c.usageLimit}` : ''}</Td>
                <Td>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {c.active ? t('common.yes') : t('common.no')}
                  </span>
                </Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <RowAction onClick={() => openEdit(c)}>{t('adminTours.edit')}</RowAction>
                    <RowAction onClick={() => void toggle(c)}>{c.active ? t('adminCoupons.deactivate') : t('adminCoupons.activate')}</RowAction>
                    <RowAction tone="red" onClick={() => setDeleteId(c.id)}>{t('adminCoupons.delete')}</RowAction>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
          </table>
        )}
      </TableCard>
      <ConfirmDialog open={deleteId !== null} title={t('adminCoupons.deleteTitle')} message={t('adminCoupons.deleteMessage')} confirmLabel={t('adminCoupons.deleteConfirm')} cancelLabel={t('adminCoupons.cancel')} onClose={() => setDeleteId(null)} onConfirm={() => deleteId && void remove(deleteId)} />
      <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
