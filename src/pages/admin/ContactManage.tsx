import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { api, apiErrorMessage } from '../../services/api';
import { formatDateStr } from '../../i18n/format';
import { useDebounce } from '../../hooks/useDebounce';
import type { Pagination } from '../../types';
import { Badge, Button, Input, Modal, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AdminPagination } from './Pagination';

interface ContactRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  isRead: boolean;
  adminReply: string | null;
  adminRepliedAt: string | null;
  createdAt: string;
}

export function ContactManage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [unread, setUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<ContactRow | null>(null);
  const [qInput, setQInput] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const q = useDebounce(qInput, 300);

  const load = (p: number = page, onlyUnread: boolean = unreadOnly, keyword: string = q) =>
    api
      .get('/admin/contact', { params: { page: p, limit: 10, ...(onlyUnread ? { unread: '1' } : {}), ...(keyword.trim() ? { q: keyword.trim() } : {}) } })
      .then((r) => {
        setRows(r.data.data);
        setPagination(r.data.pagination);
        setUnread(r.data.unread);
      })
      .catch((err) => toast.error(apiErrorMessage(err, t('adminContact.loadFailed'))));
  // Keyword / unread-filter changes reset to page 1 (the page effect reloads);
  // when already on page 1, load directly. Never fire both with a stale page.
  // First runs are skipped: the page effect covers the initial mount.
  const firstQ = useRef(true);
  const firstUnread = useRef(true);
  useEffect(() => {
    if (firstQ.current) {
      firstQ.current = false;
      return;
    }
    if (page === 1) void load(1, unreadOnly, q);
    else setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    if (firstUnread.current) {
      firstUnread.current = false;
      return;
    }
    if (page === 1) void load(1, unreadOnly, q);
    else setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);
  useEffect(() => { void load(page, unreadOnly, q); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page]);

  const setRead = async (id: string, isRead: boolean) => {
    try {
      await api.patch(`/admin/contact/${id}`, { isRead });
      if (inspect?.id === id) setInspect({ ...inspect, isRead });
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminContact.updateFailed')));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/admin/contact/${id}`);
      toast.success(t('adminContact.deleted'));
      setDeleteId(null);
      if (inspect?.id === id) setInspect(null);
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminContact.deleteFailed')));
      setDeleteId(null);
    }
  };

  const sendReply = async () => {
    if (!inspect) return;
    const text = replyText.trim();
    if (!text) {
      toast.error(t('adminContact.replyRequired'));
      return;
    }
    setSending(true);
    try {
      const { data } = await api.patch(`/admin/contact/${inspect.id}/reply`, { reply: text });
      toast.success(t('adminContact.replySent'));
      setReplyText('');
      setInspect(data.message);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err, t('adminContact.replyFailed')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
          {t('adminContact.title')}
          {unread > 0 && (
            <Badge className="bg-orange-700 text-white">{unread}</Badge>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-orange-700"
            />
            {t('adminContact.unread')}
          </label>
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
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t('adminContact.count', { count: pagination?.total ?? rows.length })}</p>
      <TableCard>
        <table className="w-full min-w-170 text-left">
          <thead className="bg-slate-50">
            <tr>
              <Th>{t('adminUsers.user')}</Th>
              <Th>{t('contact.message')}</Th>
              <Th right>{t('admin.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <TableEmpty colSpan={3}>{t('tours.emptyTitle')}</TableEmpty>
            )}
            {rows.map((m) => (
              <tr key={m.id} className={`transition-colors hover:bg-slate-50/60 ${m.isRead ? '' : 'bg-orange-50/40'}`}>
                <Td>
                  <p className="flex items-center gap-2 font-medium text-slate-900">
                    <span className="truncate">{m.name}</span>
                    {!m.isRead && <Badge className="shrink-0 bg-orange-700 text-white">{t('adminContact.unread')}</Badge>}
                    {m.adminReply && <Badge className="shrink-0 bg-emerald-100 text-emerald-800">{t('adminContact.replied')}</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-xs tabular-nums text-slate-400">{m.email}{m.phone ? ` · ${m.phone}` : ''}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-slate-400">{formatDateStr(m.createdAt)}</p>
                </Td>
                <Td className="max-w-70">
                  <button
                    type="button"
                    onClick={() => { setInspect(m); setReplyText(m.adminReply ?? ''); if (!m.isRead) void setRead(m.id, true); }}
                    className="line-clamp-2 rounded text-left text-sm text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                    title={m.message}
                  >
                    {m.message}
                  </button>
                </Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <Button variant="ghost" onClick={() => void setRead(m.id, !m.isRead)} className="px-2 text-orange-700 hover:bg-orange-50">
                      {m.isRead ? t('adminContact.markUnread') : t('adminContact.markRead')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleteId(m.id)} className="px-2 text-red-600 hover:bg-red-50">
                      {t('adminContact.delete')}
                    </Button>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <AdminPagination pagination={pagination} onPage={setPage} />
      <ConfirmDialog
        open={deleteId !== null}
        title={t('adminContact.deleteTitle')}
        message={t('adminContact.deleteMessage')}
        confirmLabel={t('adminContact.delete')}
        cancelLabel={t('adminTours.cancel')}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && void remove(deleteId)}
      />
      <Modal open={inspect !== null} onClose={() => setInspect(null)} label={t('contact.message')} wide>
        {inspect && (
          <div>
            <p className="font-semibold text-slate-900">{inspect.name}</p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-400">
              {inspect.email}{inspect.phone ? ` · ${inspect.phone}` : ''} · {formatDateStr(inspect.createdAt)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{inspect.message}</p>
            {inspect.adminReply && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <p className="text-xs font-bold uppercase text-slate-500">{t('adminContact.myReply')}</p>
                <p className="mt-1 text-slate-700">{inspect.adminReply}</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('adminContact.replyPh')}
                aria-label={t('adminContact.replyPh')}
                className="min-h-11 min-w-40 flex-1 rounded-xl border border-slate-200 px-3.5 text-sm outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void sendReply();
                  }
                }}
              />
              <Button onClick={() => void sendReply()} disabled={sending}>
                {sending ? t('adminContact.sending') : t('adminContact.replyBtn')}
              </Button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => inspect && void setRead(inspect.id, !inspect.isRead)}>
                {inspect.isRead ? t('adminContact.markUnread') : t('adminContact.markRead')}
              </Button>
              <Button variant="secondary" onClick={() => setInspect(null)}>{t('bookings.dialogCancel')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
