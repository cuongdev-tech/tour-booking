import { prisma } from '../config/env.js';
import { AppError } from '../utils/helpers.js';

export function listGuides(activeOnly = false) {
  return prisma.guide.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { name: 'asc' },
  });
}

export function createGuide(data: { name: string; phone?: string }) {
  const name = data.name.trim();
  if (name.length < 2) throw new AppError(400, 'Guide name is required');
  return prisma.guide.create({ data: { name, phone: data.phone?.trim() || null } });
}

export async function updateGuide(id: string, data: { name?: string; phone?: string | null; active?: boolean }) {
  const g = await prisma.guide.findUnique({ where: { id } });
  if (!g) throw new AppError(404, 'Guide not found');
  if (data.name !== undefined && data.name.trim().length < 2) throw new AppError(400, 'Guide name is required');
  return prisma.guide.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}

export async function deleteGuide(id: string) {
  const used = await prisma.tourDate.count({ where: { guideId: id } });
  if (used > 0) throw new AppError(400, 'Guide is assigned to tour dates');
  return prisma.guide.delete({ where: { id } });
}

export function listVehicles(activeOnly = false) {
  return prisma.vehicle.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { plate: 'asc' },
  });
}

export function createVehicle(data: { plate: string; type?: string; seats: number }) {
  const plate = data.plate.trim().toUpperCase();
  if (plate.length < 3) throw new AppError(400, 'Vehicle plate is required');
  if (!Number.isInteger(data.seats) || data.seats < 1 || data.seats > 100) {
    throw new AppError(400, 'Vehicle seats must be 1-100');
  }
  return prisma.vehicle.create({
    data: { plate, type: data.type?.trim() || 'Bus', seats: data.seats },
  });
}

export async function updateVehicle(id: string, data: { plate?: string; type?: string; seats?: number; active?: boolean }) {
  const v = await prisma.vehicle.findUnique({ where: { id } });
  if (!v) throw new AppError(404, 'Vehicle not found');
  if (data.seats !== undefined) {
    if (!Number.isInteger(data.seats) || data.seats! < 1 || data.seats! > 100) {
      throw new AppError(400, 'Vehicle seats must be 1-100');
    }
    // Cannot shrink below the largest booked count on assigned dates.
    const rows = await prisma.tourDate.findMany({ where: { vehicleId: id }, select: { booked: true, capacity: true } });
    const maxBooked = rows.reduce((m, r) => Math.max(m, r.booked), 0);
    if (data.seats! < maxBooked) throw new AppError(400, 'Vehicle seats cannot be below booked seats');
    const overCap = rows.find((r) => r.capacity > data.seats!);
    if (overCap) throw new AppError(400, 'Vehicle seats cannot be below assigned date capacity');
  }
  return prisma.vehicle.update({
    where: { id },
    data: {
      ...(data.plate !== undefined ? { plate: data.plate.trim().toUpperCase() } : {}),
      ...(data.type !== undefined ? { type: data.type.trim() || 'Bus' } : {}),
      ...(data.seats !== undefined ? { seats: data.seats } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
}

export async function deleteVehicle(id: string) {
  const used = await prisma.tourDate.count({ where: { vehicleId: id } });
  if (used > 0) throw new AppError(400, 'Vehicle is assigned to tour dates');
  return prisma.vehicle.delete({ where: { id } });
}
