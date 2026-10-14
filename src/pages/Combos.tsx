import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import type { Combo, Pagination } from '../types';
import { Badge, EmptyState, PageContainer, Pager, RetryState, SafeImage, Skeleton } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export function Combos() {
  useDocumentMeta('Combo tour', 'Combo nhiều tour giá ưu đãi');
  const [combos, setCombos] = useState<Combo[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = () => {
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    api
      .get('/combos', { params: { page, limit: 9 }, signal: ctrl.signal })
      .then((r) => {
        setCombos(r.data.data ?? []);
        setPagination(r.data.pagination ?? null);
      })
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
  }, [page]);

  return (
    <PageContainer className="py-8 md:py-12">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-700">Combos</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Combo tiết kiệm</h1>
      <p className="mt-2 text-slate-500">Gộp nhiều tour trong một lần đặt — giảm thêm theo combo.</p>
      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}
        </div>
      ) : failed ? (
        <div className="mt-6"><RetryState title="Không tải được combo" onRetry={load} retryLabel="Thử lại" /></div>
      ) : combos.length === 0 ? (
        <div className="mt-6"><EmptyState title="Chưa có combo nào" hint="Hãy quay lại sau." /></div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {combos.map((c) => (
              <Link
                key={c.id}
                to={`/combos/${c.slug}`}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <div className="h-44 shrink-0 overflow-hidden bg-slate-100">
                  <SafeImage src={c.images?.[0] ?? ''} alt={c.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                {c.discountPercent > 0 && (
                  <Badge className="absolute left-3 top-3 bg-red-600 text-white shadow-sm">-{c.discountPercent}%</Badge>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="line-clamp-2 text-[17px] font-bold leading-snug tracking-tight text-slate-900 group-hover:text-orange-800">{c.title}</h2>
                  {c.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{c.description}</p>}
                </div>
              </Link>
            ))}
          </div>
          <Pager pagination={pagination} onPage={setPage} />
        </>
      )}
    </PageContainer>
  );
}
