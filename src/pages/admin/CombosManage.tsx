import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import type { Combo, Pagination } from '../../types';
import { Button, Card, Field, Input, RowAction, Select, TableCard, TableEmpty, Td, Textarea, Th } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

const empty = { title: '', slug: '', description: '', tourIds: '', discountPercent: 10, images: '', featured: false, status: 'ACTIVE' };

export function CombosManage() {
  const { t } = useTranslation();
  const [combos, setCombos] = useState<Combo[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Combo | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const { register, handleSubmit, reset } = useForm({ defaultValues: empty });

  const load = (p: number = page) => {
    api
      .get('/admin/combos', { params: { page: p, limit: 10 } })
      .then((r) => {
        setCombos(r.data.data ?? r.data.combos ?? []);
        setPagination(r.data.pagination ?? null);
      })
      .catch((err) => toast.error(apiErrorMessage(err, t('admin.loadFailed'))));
  };
  useEffect(() => { load(page); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
    reset(empty);
  };

  const openEdit = (c: Combo) => {
    setEditing(c);
    setShowForm(true);
    reset({
      title: c.title,
      slug: c.slug,
      description: c.description ?? '',
      tourIds: (c.tourIds ?? []).join('\n'),
      discountPercent: c.discountPercent,
      images: (c.images ?? []).join('\n'),
      featured: c.featured ?? false,
      status: c.status,
    });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const submit = async (v: typeof empty) => {
    try {
      const tourIds = String(v.tourIds ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
      if (tourIds.length < 2 || tourIds.length > 6) {
        toast.error('Combo phải gồm 2–6 tours (mỗi dòng 1 id)');
        return;
      }
      const discountPercent = Number(v.discountPercent);
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 90) {
        toast.error('Giảm giá phải từ 0–90%');
        return;
      }
      const payload = {
        ...(v.slug.trim() ? { slug: v.slug.trim() } : {}),
        title: v.title.trim(),
        description: v.description,
        tourIds,
        discountPercent,
        images: String(v.images ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
        featured: Boolean(v.featured),
        status: v.status,
      };
      if (!payload.title) throw new Error('Missing title');
      if (editing) await api.patch(`/admin/combos/${editing.id}`, payload);
      else await api.post('/admin/combos', payload);
      toast.success('Đã lưu combo');
      closeForm();
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Lưu combo thất bại'));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/combos/${id}`);
      toast.success('Đã xóa combo');
      setDeleteId(null);
      if (combos.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Xóa thất bại'));
      setDeleteId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{pagination?.total ?? combos.length} combo</p>
        <Button onClick={openCreate}>Combo mới</Button>
      </div>
      {showForm && (
        <Card className="mt-4 p-6">
          <h2 className="font-semibold">{editing ? 'Sửa combo' : 'Combo mới'}</h2>
          <form onSubmit={handleSubmit(submit)} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Tiêu đề"><Input {...register('title', { required: true })} /></Field>
            <Field label="Slug (trống = tự tạo)"><Input {...register('slug')} placeholder="combo-ha-long-sapa" /></Field>
            <div className="md:col-span-2"><Field label="Mô tả"><Textarea {...register('description')} rows={2} /></Field></div>
            <div className="md:col-span-2">
              <Field label="Tour IDs (mỗi dòng 1 id, 2–6 tours)" hint="Copy id từ trang quản lý tours">
                <Textarea {...register('tourIds', { required: true })} rows={4} placeholder={'tour-id-1\ntour-id-2'} />
              </Field>
            </div>
            <Field label="Giảm giá % (0–90)"><Input type="number" min={0} max={90} {...register('discountPercent', { valueAsNumber: true })} /></Field>
            <Field label="Trạng thái">
              <Select {...register('status')}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Ảnh (mỗi dòng 1 URL)"><Textarea {...register('images')} rows={3} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('featured')} /> Nổi bật</label>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit">Lưu</Button>
              <Button type="button" variant="secondary" onClick={closeForm}>Hủy</Button>
            </div>
          </form>
        </Card>
      )}
      <TableCard>
        <table className="w-full min-w-180 text-left">
          <thead className="bg-slate-50">
            <tr><Th>Tiêu đề</Th><Th>Giảm</Th><Th>Trạng thái</Th><Th right>Thao tác</Th></tr>
          </thead>
          <tbody>
            {combos.length === 0 && <TableEmpty colSpan={4}>Chưa có combo</TableEmpty>}
            {combos.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-slate-50/60">
                <Td className="max-w-70">
                  <p className="truncate font-medium text-slate-900">{c.title}{c.featured ? ' ★' : ''}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{c.slug} · {(c.tourIds ?? []).length} tours</p>
                </Td>
                <Td className="tabular-nums">{c.discountPercent}%</Td>
                <Td>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {c.status}
                  </span>
                </Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <RowAction onClick={() => openEdit(c)}>Sửa</RowAction>
                    <RowAction tone="red" onClick={() => setDeleteId(c.id)}>Xóa</RowAction>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <ConfirmDialog
        open={deleteId !== null}
        title="Xóa combo?"
        message="Không thể hoàn tác."
        confirmLabel="Xóa"
        cancelLabel="Hủy"
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && void remove(deleteId)}
      />
      <AdminPagination pagination={pagination} onPage={setPage} />
    </div>
  );
}
