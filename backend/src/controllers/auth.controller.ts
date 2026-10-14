import type { Request, Response } from 'express';
import * as service from '../services/auth.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.register(req.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.login(req.body);
  res.json(result);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.getMe(req.user!.id, req.user!.tv);
  res.json({ user });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await service.updateProfile(req.user!.id, req.body);
  res.json({ user });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.requestPasswordReset(req.body.email));
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.resetPassword(req.body.token, req.body.password);
  res.json(result);
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.verifyEmail(req.body.token));
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.resendVerification(req.body.email));
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.refreshToken(req.user!.id, req.user!.tv);
  res.json(result);
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Stateless JWT: server has nothing to revoke per-session beyond tokenVersion
  // (bumped on password change). Client drops the token; endpoint exists so
  // logout is explicit and future blocklist logic has a hook.
  res.json({ success: true });
});
