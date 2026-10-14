import { Prisma } from '@prisma/client';
import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[đ]/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 100) || 'post'
  );
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const clean = base.trim() || 'post';
  let candidate = clean;
  let n = 1;
  for (;;) {
    const clash = await prisma.post.findUnique({ where: { slug: candidate } });
    if (!clash || clash.id === excludeId) return candidate;
    n += 1;
    candidate = `${clean}-${n}`;
  }
}

function parseTourIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, 10);
}

export async function listPosts(params: { status?: unknown; page?: unknown; limit?: unknown; q?: unknown }) {
  const p = Math.max(1, Math.floor(Number(params.page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(params.limit) || 10)));
  const rawStatus = typeof params.status === 'string' ? params.status.toUpperCase() : '';
  const where: Prisma.PostWhereInput = {};
  if (rawStatus === 'DRAFT' || rawStatus === 'PUBLISHED') {
    where.status = rawStatus;
  } else if (rawStatus !== 'ALL') {
    // Public default: drafts are never exposed without an explicit admin filter.
    where.status = 'PUBLISHED';
  }
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { excerpt: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [total, data] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      skip: (p - 1) * l,
      take: l,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);
  return {
    data,
    pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) },
  };
}

export async function getPostBySlug(slug: string, includeDraft = false) {
  const post = await prisma.post.findUnique({ where: { slug } });
  if (!post || (!includeDraft && post.status !== 'PUBLISHED')) throw new AppError(404, 'Post not found');
  const tourIds = parseTourIds(post.tourIds).slice(0, 3);
  const relatedTours =
    tourIds.length > 0
      ? await prisma.tour.findMany({
          where: { id: { in: tourIds }, status: 'ACTIVE' },
          select: { id: true, slug: true, title: true, images: true, price: true, destination: true },
          take: 3,
        })
      : [];
  // Inactive/missing tours drop out — keep the author's tourIds order.
  const order = new Map(tourIds.map((id, i) => [id, i]));
  relatedTours.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { ...post, relatedTours };
}

export async function adminCreatePost(data: {
  slug?: string;
  title: string;
  excerpt?: string;
  content: string;
  cover?: string | null;
  status?: 'DRAFT' | 'PUBLISHED';
  tourIds?: string[];
}) {
  const title = data.title.trim();
  if (!title) throw new AppError(400, 'Title must not be empty');
  const content = data.content.trim();
  if (!content) throw new AppError(400, 'Content must not be empty');
  const slug = await uniqueSlug(data.slug?.trim() || slugify(title));
  const status = data.status ?? 'DRAFT';
  return prisma.post.create({
    data: {
      slug,
      title,
      excerpt: data.excerpt?.trim() ?? '',
      content,
      cover: data.cover?.trim() || null,
      status,
      tourIds: parseTourIds(data.tourIds) as unknown as Prisma.InputJsonValue,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
    },
  });
}

export async function adminUpdatePost(
  id: string,
  data: Partial<{
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    cover: string | null;
    status: 'DRAFT' | 'PUBLISHED';
    tourIds: string[];
  }>,
) {
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Post not found');
  if (data.title !== undefined && !data.title.trim()) throw new AppError(400, 'Title must not be empty');
  if (data.content !== undefined && !data.content.trim()) throw new AppError(400, 'Content must not be empty');
  let slug: string | undefined;
  if (data.slug !== undefined) {
    const title = (data.title ?? existing.title).trim() || existing.title;
    slug = await uniqueSlug(data.slug.trim() || slugify(title), id);
  }
  const status = data.status ?? existing.status;
  const publishing = status === 'PUBLISHED' && (existing.status !== 'PUBLISHED' || !existing.publishedAt);
  return prisma.post.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.excerpt !== undefined ? { excerpt: data.excerpt.trim() } : {}),
      ...(data.content !== undefined ? { content: data.content.trim() } : {}),
      ...(data.cover !== undefined ? { cover: data.cover?.trim() || null } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.tourIds !== undefined
        ? { tourIds: parseTourIds(data.tourIds) as unknown as Prisma.InputJsonValue }
        : {}),
      ...(publishing ? { publishedAt: new Date() } : {}),
    },
  });
}

export async function adminDeletePost(id: string) {
  const row = await prisma.post.findUnique({ where: { id } });
  if (!row) throw new AppError(404, 'Post not found');
  await prisma.post.delete({ where: { id } });
  return { success: true };
}
