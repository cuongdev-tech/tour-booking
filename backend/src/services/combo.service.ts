import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

/** tourIds is a Prisma Json column (string[] at runtime, "[]" default). */
export function parseTourIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return [];
    }
  }
  return [];
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[đ]/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 100) || 'combo'
  );
}

function pageParams(page?: unknown, limit?: unknown): { page: number; limit: number } {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 10)));
  return { page: p, limit: l };
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base || 'combo';
  let n = 2;
  for (;;) {
    const clash = await prisma.combo.findUnique({ where: { slug } });
    if (!clash || clash.id === excludeId) return slug;
    slug = `${base}-${n}`;
    n += 1;
  }
}

function assertDiscount(value: unknown): number {
  const d = Number(value ?? 0);
  if (!Number.isInteger(d) || d < 0 || d > 90) throw new AppError(400, 'Invalid discount percent');
  return d;
}

async function assertTourIds(tourIds: unknown): Promise<string[]> {
  const ids = [...new Set(parseTourIds(tourIds))];
  if (ids.length < 2 || ids.length > 6) throw new AppError(400, 'Combo must include 2-6 tours');
  const found = await prisma.tour.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new AppError(404, 'Tour not found');
  return ids;
}

/** Public catalog — only ACTIVE combos are ever listed, whatever is asked. */
export async function listCombos(opts?: { status?: unknown; page?: unknown; limit?: unknown }) {
  const { page, limit } = pageParams(opts?.page, opts?.limit);
  const where = { status: 'ACTIVE' as const };
  const [total, data] = await Promise.all([
    prisma.combo.count({ where }),
    prisma.combo.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export function adminListCombos(status?: string, page?: unknown, limit?: unknown) {
  const { page: p, limit: l } = pageParams(page, limit);
  const where = status === 'ACTIVE' || status === 'INACTIVE' ? { status } as const : {};
  return Promise.all([
    prisma.combo.count({ where }),
    prisma.combo.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p - 1) * l, take: l }),
  ]).then(([total, data]) => ({
    data,
    pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) },
  }));
}

export async function getComboDetail(slugOrId: string) {
  const combo = await prisma.combo.findFirst({ where: { OR: [{ id: slugOrId }, { slug: slugOrId }] } });
  if (!combo || combo.status !== 'ACTIVE') throw new AppError(404, 'Combo not found');
  const ids = [...new Set(parseTourIds(combo.tourIds))];
  const tours =
    ids.length > 0
      ? await prisma.tour.findMany({ where: { id: { in: ids }, status: 'ACTIVE' } })
      : [];
  const byId = new Map(tours.map((t) => [t.id, t]));
  const ordered = ids.map((id) => byId.get(id)).filter((t): t is (typeof tours)[number] => Boolean(t));
  // A leg that went INACTIVE (or was removed) must block the sale, not sell a subset.
  if (ordered.length !== ids.length) throw new AppError(400, 'Combo contains unavailable tour');
  const tourTotal = ordered.reduce((sum, t) => sum + t.price, 0);
  const discountAmount = Math.round((tourTotal * combo.discountPercent) / 100);
  return { combo, tours: ordered, tourTotal, discountAmount, comboTotal: tourTotal - discountAmount };
}

/** Sibling legs of a combo order (same comboGroup) for cross-leg warnings. */
export async function getComboGroup(group: string, userId: string, isAdmin: boolean) {
  const code = group.trim().toUpperCase();
  if (!code) throw new AppError(400, 'Combo group is required');
  return prisma.booking.findMany({
    where: { comboGroup: code, ...(isAdmin ? {} : { userId }) },
    select: {
      id: true,
      bookingCode: true,
      bookingStatus: true,
      total: true,
      travelDate: true,
      tour: { select: { id: true, title: true } },
      payment: { select: { status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export interface ComboInput {
  slug?: string;
  title: string;
  description: string;
  tourIds: string[];
  discountPercent?: number;
  images?: string[];
  featured?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
}

export async function adminCreateCombo(input: ComboInput) {
  const discountPercent = assertDiscount(input.discountPercent);
  const ids = await assertTourIds(input.tourIds);
  const slug = await uniqueSlug(input.slug?.trim() || slugify(input.title));
  return prisma.combo.create({
    data: {
      slug,
      title: input.title,
      description: input.description,
      tourIds: ids,
      discountPercent,
      images: input.images ?? [],
      featured: input.featured ?? false,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function adminUpdateCombo(id: string, patch: Partial<ComboInput>) {
  const existing = await prisma.combo.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Combo not found');
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.discountPercent !== undefined) data.discountPercent = assertDiscount(patch.discountPercent);
  if (patch.tourIds !== undefined) data.tourIds = await assertTourIds(patch.tourIds);
  if (patch.images !== undefined) data.images = patch.images;
  if (patch.featured !== undefined) data.featured = patch.featured;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.slug !== undefined) {
    const next = patch.slug.trim() || slugify(typeof patch.title === 'string' ? patch.title : existing.title);
    data.slug = await uniqueSlug(next, id);
  }
  return prisma.combo.update({ where: { id }, data: data as never });
}

export async function adminDeleteCombo(id: string) {
  // Bookings reference combos with SetNull, so deleting a combo never orphans them.
  const deleted = await prisma.combo.deleteMany({ where: { id } });
  if (deleted.count === 0) throw new AppError(404, 'Combo not found');
  return { success: true };
}
