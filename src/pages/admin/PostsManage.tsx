import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatDateStr } from '../../i18n/format';
import type { Pagination, Post } from '../../types';
import { Button, Card, Field, Input, RowAction, Select, TableCard, TableEmpty, Td, Textarea, Th } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

const empty = { title: '', slug: '', excerpt: '', content: '', cover: '', status: 'DRAFT', tourIds: '' };

export function PostsManage() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const { register, handleSubmit, reset } = useForm({ defaultValues: empty });

  const load = (p: number = page) => {
    api
      .get('/admin/posts', { params: { page: p, limit: 10 } })
      .then((r) => {
        setPosts(r.data.data ?? []);
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

  const openEdit = (p: Post & { content?: string; tourIds?: string[] }) => {
    setEditing(p);
    setShowForm(true);
    reset({
      title: p.title,
      slug: p.slug,
      excerpt: (p as { excerpt?: string }).excerpt ?? '',
      content: p.content ?? '',
      cover: p.cover ?? '',
      status: p.status ?? 'DRAFT',
      tourIds: (p.tourIds ?? []).join(', '),
    });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const submit = async (v: typeof empty) => {
    try {
      const payload = {
        ...(v.slug.trim() ? { slug: v.slug.trim() } : {}),
        title: v.title.trim(),
        excerpt: v.excerpt.trim(),
        content: v.content,
        cover: v.cover.trim() || null,
        status: v.status,
        tourIds: v.tourIds.split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (!payload.title || !payload.content) throw new Error('Missing fields');
      if (editing) await api.patch(`/admin/posts/${editing.id}`, payload);
      else await api.post('/admin/posts', payload);
      toast.success('Đã lưu bài viết');
      closeForm();
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Lưu bài viết thất bại'));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/posts/${id}`);
      toast.success('Đã xóa bài viết');
      setDeleteId(null);
      if (posts.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Xóa thất bại'));
      setDeleteId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{pagination?.total ?? posts.length} bài viết</p>
        <Button onClick={openCreate}>Bài viết mới</Button>
      </div>
      {showForm && (
        <Card className="mt-4 p-6">
          <h2 className="font-semibold">{editing ? 'Sửa bài viết' : 'Bài viết mới'}</h2>
          <form onSubmit={handleSubmit(submit)} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Tiêu đề"><Input {...register('title', { required: true })} /></Field>
            <Field label="Slug (trống = tự tạo)" hint="Chữ thường, gạch ngang"><Input {...register('slug')} placeholder="vi-du-bai-viet" /></Field>
            <div className="md:col-span-2"><Field label="Tóm tắt"><Textarea {...register('excerpt')} rows={2} /></Field></div>
            <div className="md:col-span-2"><Field label="Nội dung"><Textarea {...register('content', { required: true })} rows={8} /></Field></div>
            <Field label="Ảnh bìa (URL)"><Input {...register('cover')} placeholder="https://..." /></Field>
            <Field label="Trạng thái">
              <Select {...register('status')}>
                <option value="DRAFT">DRAFT</option>
                <option value="PUBLISHED">PUBLISHED</option>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Tour liên quan (IDs, cách nhau dấu phẩy)"><Input {...register('tourIds')} placeholder="id1, id2" /></Field>
            </div>
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
            <tr><Th>Tiêu đề</Th><Th>Slug</Th><Th>Ngày đăng</Th><Th right>Thao tác</Th></tr>
          </thead>
          <tbody>
            {posts.length === 0 && <TableEmpty colSpan={4}>Chưa có bài viết</TableEmpty>}
            {posts.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-slate-50/60">
                <Td className="max-w-70"><p className="truncate font-medium text-slate-900">{p.title}</p></Td>
                <Td className="font-mono text-xs text-slate-500">{p.slug}</Td>
                <Td className="whitespace-nowrap tabular-nums">{p.publishedAt ? formatDateStr(p.publishedAt) : '—'}</Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <RowAction onClick={() => openEdit(p)}>Sửa</RowAction>
                    <RowAction tone="red" onClick={() => setDeleteId(p.id)}>Xóa</RowAction>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <ConfirmDialog
        open={deleteId !== null}
        title="Xóa bài viết?"
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
