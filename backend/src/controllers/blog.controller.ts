import type { Request, Response } from 'express';
import * as service from '../services/blog.service.js';
import { asyncHandler } from '../utils/helpers.js';

export const publicList = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await service.listPosts({ page: req.query.page, limit: req.query.limit, q }));
});

export const publicDetail = asyncHandler(async (req: Request, res: Response) => {
  const post = await service.getPostBySlug(req.params.slug);
  res.json({ post });
});

export const adminList = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await service.listPosts({ status, page: req.query.page, limit: req.query.limit, q }));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const post = await service.adminCreatePost(req.body);
  res.status(201).json({ post });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  res.json({ post: await service.adminUpdatePost(req.params.id, req.body) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  res.json(await service.adminDeletePost(req.params.id));
});
