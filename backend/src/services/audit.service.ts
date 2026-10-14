import { prisma } from '../config/env.js';

/** Fire-and-forget audit trail: never blocks the main action on failure. */
export function logAdminAction(
  adminId: string,
  action: string,
  entityType: string,
  entityId?: string,
  detail: Record<string, unknown> = {},
): void {
  void prisma.adminAction
    .create({ data: { adminId, action, entityType, entityId: entityId ?? null, detail: detail as never } })
    .catch((err) => console.error('audit log failed:', err));
}

export function listAdminActions(page?: unknown, limit?: unknown, action?: string, adminId?: string, entityType?: string) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const l = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (adminId) where.adminId = adminId;
  if (entityType) where.entityType = entityType;
  return Promise.all([
    prisma.adminAction.count({ where }),
    prisma.adminAction.findMany({
      where,
      include: { admin: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * l,
      take: l,
    }),
  ]).then(([total, data]) => ({
    data,
    pagination: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) },
  }));
}
