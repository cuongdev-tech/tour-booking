import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Search } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api';
import { formatDateStr } from '../i18n/format';
import type { Pagination, Post } from '../types';
import { Button, EmptyState, Input, PageContainer, Pager, RetryState, SafeImage, Skeleton } from '../components/ui/kit';
import { useDebounce } from '../hooks/useDebounce';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { toast } from 'sonner';

export function Blog() {
  useDocumentMeta('Blog', 'Tin tức và cẩm nang du lịch');
  const [qInput, setQInput] = useState('');
  const q = useDebounce(qInput, 300);
  const [posts, setPosts] = useState<Post[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    api
      .get('/posts', { params: { page, limit: 9, ...(q ? { q } : {}) }, signal: ctrl.signal })
      .then((r) => {
        setPosts(r.data.data ?? []);
        setPagination(r.data.pagination ?? null);
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.code === 'ERR_CANCELED') return;
        setFailed(true);
        toast.error(apiErrorMessage(err, 'Không tải được bài viết'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [page, q, attempt]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  return (
    <PageContainer className="py-8 md:py-12">
      <p className="text-xs font-bold uppercase tracking-widest text-orange-700">Blog</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Tin tức &amp; cẩm nang</h1>
      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Tìm bài viết..." className="pl-10" aria-label="Tìm bài viết" />
      </div>
      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-72" />)}
        </div>
      ) : failed ? (
        <div className="mt-6"><RetryState title="Không tải được bài viết" onRetry={() => setAttempt((a) => a + 1)} retryLabel="Thử lại" /></div>
      ) : posts.length === 0 ? (
        <div className="mt-6"><EmptyState title="Chưa có bài viết" hint="Hãy quay lại sau." /></div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <Link
                key={p.id}
                to={`/blog/${p.slug}`}
                className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <div className="h-44 shrink-0 overflow-hidden bg-slate-100">
                  <SafeImage src={p.cover ?? ''} alt={p.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="line-clamp-2 text-[17px] font-bold leading-snug tracking-tight text-slate-900 group-hover:text-orange-800">{p.title}</h2>
                  {p.excerpt && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.excerpt}</p>}
                  {p.publishedAt && <p className="mt-3 text-xs tabular-nums text-slate-400">{formatDateStr(p.publishedAt)}</p>}
                </div>
              </Link>
            ))}
          </div>
          <Pager pagination={pagination} onPage={setPage} />
        </>
      )}
      {failed && posts.length > 0 && (
        <div className="mt-4"><Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>Thử lại</Button></div>
      )}
    </PageContainer>
  );
}
