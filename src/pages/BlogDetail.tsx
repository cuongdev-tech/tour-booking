import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../services/api';
import { formatDateStr } from '../i18n/format';
import { formatCurrency, type PostDetail } from '../types';
import { Button, EmptyState, PageContainer, RetryState, SafeImage, SectionHeader, Skeleton } from '../components/ui/kit';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

interface RelatedTour {
  id: string;
  slug?: string;
  title: string;
  images: string[];
  price: number;
  destination: string;
}

export function BlogDetail() {
  const { slug } = useParams();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [related, setRelated] = useState<RelatedTour[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useDocumentMeta(post?.title ?? 'Bài viết');

  const load = () => {
    if (!slug) return;
    const ctrl = new AbortController();
    setLoading(true);
    setFailed(false);
    api
      .get(`/posts/${slug}`, { signal: ctrl.signal })
      .then((r) => {
        setPost(r.data.post);
        setRelated(r.data.relatedTours ?? []);
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
  };

  useEffect(() => {
    const cleanup = load();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (loading) {
    return (
      <PageContainer className="py-8 md:py-10">
        <Skeleton className="h-64" />
        <Skeleton className="mt-4 h-40" />
      </PageContainer>
    );
  }
  if (failed || !post) {
    return (
      <PageContainer className="py-8 md:py-10">
        {failed ? (
          <RetryState title="Không tải được bài viết" onRetry={load} retryLabel="Thử lại" />
        ) : (
          <EmptyState title="Không tìm thấy bài viết" action={<Link to="/blog"><Button>Về Blog</Button></Link>} />
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer className="py-8 md:py-10">
      <nav aria-label="breadcrumb" className="flex items-center gap-1 text-sm text-slate-500">
        <Link to="/blog" className="rounded hover:text-orange-700">Blog</Link>
        <span aria-hidden>/</span>
        <span aria-current="page" className="truncate font-medium text-slate-900">{post.title}</span>
      </nav>
      <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{post.title}</h1>
      {post.publishedAt && <p className="mt-2 text-sm tabular-nums text-slate-400">{formatDateStr(post.publishedAt)}</p>}
      {post.cover && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200/70">
          <SafeImage src={post.cover} alt={post.title} eager className="max-h-105 w-full object-cover" />
        </div>
      )}
      {post.excerpt && <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-600">{post.excerpt}</p>}
      <article className="prose prose-slate mt-4 max-w-3xl whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
        {post.content}
      </article>

      {related.length > 0 && (
        <div className="mt-12">
          <SectionHeader title="Tour liên quan" />
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((rt) => (
              <Link
                key={rt.id}
                to={`/tour/${rt.id}`}
                className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-soft transition-all hover:-translate-y-1 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <div className="h-44 shrink-0 overflow-hidden bg-slate-100">
                  <SafeImage src={rt.images?.[0] ?? ''} alt={rt.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{rt.destination}</p>
                  <h3 className="mt-1 line-clamp-2 font-bold text-slate-900 group-hover:text-orange-800">{rt.title}</h3>
                  <p className="mt-2 text-lg font-bold tabular-nums text-orange-700">{formatCurrency(rt.price)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
