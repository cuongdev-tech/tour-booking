import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../config/env.js';
import { requireAdmin, requireCustomer } from './auth.js';

// User tạm với email duy nhất, dọn sau test — không động vào dữ liệu thật.
const email = `sec-test-${Date.now()}@example.com`;
let userId: string;

function mockReq(role: 'CUSTOMER' | 'ADMIN') {
  return { user: { id: userId, role } } as never;
}

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { name: 'Sec Test', email, passwordHash: 'x', role: 'CUSTOMER', status: 'ACTIVE' },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
});

describe('requireAdmin', () => {
  it('cho admin đang hoạt động qua', async () => {
    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN', status: 'ACTIVE' } });
    const next = vi.fn();
    await requireAdmin(mockReq('ADMIN'), {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('chặn token cũ sau khi hạ quyền', async () => {
    await prisma.user.update({ where: { id: userId }, data: { role: 'CUSTOMER' } });
    await expect(requireAdmin(mockReq('ADMIN'), {} as never, vi.fn())).rejects.toMatchObject({ statusCode: 403 });
  });

  it('chặn tài khoản bị khóa', async () => {
    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN', status: 'INACTIVE' } });
    await expect(requireAdmin(mockReq('ADMIN'), {} as never, vi.fn())).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('requireCustomer', () => {
  it('cho customer đang hoạt động qua', async () => {
    await prisma.user.update({ where: { id: userId }, data: { role: 'CUSTOMER', status: 'ACTIVE' } });
    const next = vi.fn();
    await requireCustomer(mockReq('CUSTOMER'), {} as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('chặn token cũ của tài khoản bị khóa', async () => {
    await prisma.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } });
    await expect(requireCustomer(mockReq('CUSTOMER'), {} as never, vi.fn())).rejects.toMatchObject({ statusCode: 403 });
  });
});
