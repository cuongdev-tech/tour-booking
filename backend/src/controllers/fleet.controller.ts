import type { Request, Response } from 'express';
import { listAdminActions } from '../services/audit.service.js';
import * as fleet from '../services/fleet.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const auditLog = asyncHandler(async (req: Request, res: Response) => {
  const { data, pagination } = await listAdminActions(
    req.query.page,
    req.query.limit,
    typeof req.query.action === 'string' ? req.query.action : undefined,
    typeof req.query.adminId === 'string' ? req.query.adminId : undefined,
    typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
  );
  res.json({ data, pagination });
});

export const listGuides = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await fleet.listGuides(req.query.activeOnly === 'true') });
});

export const createGuide = asyncHandler(async (req: Request, res: Response) => {
  const g = await fleet.createGuide(req.body);
  const { logAdminAction } = await import('../services/audit.service.js');
  logAdminAction(req.user!.id, 'GUIDE_CREATE', 'Guide', g.id, { name: g.name });
  res.status(201).json({ guide: g });
});

export const updateGuide = asyncHandler(async (req: Request, res: Response) => {
  const g = await fleet.updateGuide(req.params.id, req.body);
  const { logAdminAction } = await import('../services/audit.service.js');
  logAdminAction(req.user!.id, 'GUIDE_UPDATE', 'Guide', g.id, req.body);
  res.json({ guide: g });
});

export const deleteGuide = asyncHandler(async (req: Request, res: Response) => {
  await fleet.deleteGuide(req.params.id);
  const { logAdminAction } = await import('../services/audit.service.js');
  logAdminAction(req.user!.id, 'GUIDE_DELETE', 'Guide', req.params.id, {});
  res.json({ success: true });
});

export const listVehicles = asyncHandler(async (req: Request, res: Response) => {
  res.json({ data: await fleet.listVehicles(req.query.activeOnly === 'true') });
});

export const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const v = await fleet.createVehicle(req.body);
  const { logAdminAction } = await import('../services/audit.service.js');
  logAdminAction(req.user!.id, 'VEHICLE_CREATE', 'Vehicle', v.id, { plate: v.plate });
  res.status(201).json({ vehicle: v });
});

export const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  const v = await fleet.updateVehicle(req.params.id, req.body);
  const { logAdminAction } = await import('../services/audit.service.js');
  logAdminAction(req.user!.id, 'VEHICLE_UPDATE', 'Vehicle', v.id, req.body);
  res.json({ vehicle: v });
});

export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  await fleet.deleteVehicle(req.params.id);
  const { logAdminAction } = await import('../services/audit.service.js');
  logAdminAction(req.user!.id, 'VEHICLE_DELETE', 'Vehicle', req.params.id, {});
  res.json({ success: true });
});
