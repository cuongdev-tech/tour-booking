import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatMoney } from '../../i18n/format';
import type { Coupon, Pagination } from '../../types';
import { Button, Card, Field, Input, Select } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

const empty = { code: '', type: 'PERCENT', value: 10, minOrder: 1000000, expiresAt: '', usageLimit: 100, active: true };

export function CouponsManage() {
  const { t } = useTranslation();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const { register, handleSubmit, reset } = useForm({ defaultValues: empty });

  const load = (p: number = page) =>
    api
      .get('/admin/coupons', { params: { page: p, limit: 10 } })
      .then((r) => {
        setCoupons(r.data.data);
        setPagination(r.data.pagination);
      })
      .catch(() => toast.error(t('adminCoupons.loadFailed')));
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
      expiresAt: c.expiresAt.slice(0, 10),
      usageLimit: c.usageLimit ?? 100,
      active: c.active,
    });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const submit = async (v: typeof empty & { type: string }) => {
    const payload = {
      ...(editing ? {} : { code: v.code }),
      type: v.type,
      value: Number(v.value),
      minOrder: Number(v.minOrder),
      expiresAt: new Date(v.expiresAt).toISOString(),
      usageLimit: Number(v.usageLimit),
      active: v.active,
    };
    try {
      if (editing) {
        await api.patch(`/admin/coupons/${editing.id}`, payload);
        toast.success(t('adminCoupons.updated'));
      } else {
        await api.post('/admin/coupons', payload);
        toast.success(t('adminCoupons.created'));
      }
      closeForm();
      reset();
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, editing ? t('adminCoupons.updateFailed') : t('adminCoupons.createFailed')));
    }
  };

  const toggle = async (c: Coupon) => {
    try {
      await api.patch(`/admin/coupons/${c.id}`, { active: !c.active });
      load();
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
      <div className="flex justify-between">
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
            <Field label={t('adminCoupons.usageLimit')}><Input type="number" {...register('usageLimit', { valueAsNumber: true })} /></Field>
            <div className="flex items-end gap-2 md:col-span-3">
              <Button type="submit">{editing ? t('adminCoupons.update') : t('adminCoupons.create')}</Button>
              <Button type="button" variant="secondary" onClick={closeForm}>{t('adminCoupons.cancel')}</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-170 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">{t('adminCoupons.code')}</th><th className="px-4 py-3">{t('adminCoupons.value')}</th><th className="px-4 py-3">{t('adminCoupons.used')}</th><th className="px-4 py-3">{t('adminCoupons.active')}</th><th className="px-4 py-3 text-right">{t('admin.actions')}</th></tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono font-bold">{c.code}</td>
                <td className="px-4 py-3">{c.type === 'PERCENT' ? `${c.value}%` : formatMoney(c.value)}</td>
                <td className="px-4 py-3">{c.usedCount}{c.usageLimit ? `/${c.usageLimit}` : ''}</td>
                <td className="px-4 py-3">{c.active ? t('common.yes') : t('common.no')}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(c)} className="mr-3 font-semibold text-teal-700 hover:underline">{t('adminTours.edit')}</button>
                  <button onClick={() => void toggle(c)} className="mr-3 font-semibold text-teal-700 hover:underline">{c.active ? t('adminCoupons.deactivate') : t('adminCoupons.activate')}</button>
                  <button onClick={() => setDeleteId(c.id)} className="font-semibold text-red-600 hover:underline">{t('adminCoupons.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={deleteId !== null} title={t('adminCoupons.deleteTitle')} message={t('adminCoupons.deleteMessage')} confirmLabel={t('adminCoupons.deleteConfirm')} cancelLabel={t('adminCoupons.cancel')} onClose={() => setDeleteId(null)} onConfirm={() => deleteId && void remove(deleteId)} />
      <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
