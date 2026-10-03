import { describe, expect, it } from 'vitest';
import {
  replyReviewSchema,
  updateBookingStatusSchema,
  updateReviewVisibilitySchema,
} from './schemas.js';

describe('replyReviewSchema (trả lời đánh giá)', () => {
  it('chặn rỗng và toàn dấu cách', () => {
    expect(replyReviewSchema.safeParse({ reply: '' }).success).toBe(false);
    expect(replyReviewSchema.safeParse({ reply: '   ' }).success).toBe(false);
    expect(replyReviewSchema.safeParse({}).success).toBe(false);
  });

  it('nhận reply hợp lệ và trim sẵn', () => {
    const r = replyReviewSchema.safeParse({ reply: '  Cảm ơn bạn  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reply).toBe('Cảm ơn bạn');
  });

  it('chặn reply quá 2000 ký tự', () => {
    expect(replyReviewSchema.safeParse({ reply: 'a'.repeat(2000) }).success).toBe(true);
    expect(replyReviewSchema.safeParse({ reply: 'a'.repeat(2001) }).success).toBe(false);
  });
});

describe('updateReviewVisibilitySchema', () => {
  it('chỉ nhận boolean', () => {
    expect(updateReviewVisibilitySchema.safeParse({ hidden: true }).success).toBe(true);
    expect(updateReviewVisibilitySchema.safeParse({ hidden: '1' }).success).toBe(false);
    expect(updateReviewVisibilitySchema.safeParse({}).success).toBe(false);
  });
});

describe('updateBookingStatusSchema', () => {
  it('chặn trạng thái lạ', () => {
    expect(updateBookingStatusSchema.safeParse({ status: 'CONFIRMED' }).success).toBe(true);
    expect(updateBookingStatusSchema.safeParse({ status: 'SHIPPED' }).success).toBe(false);
  });
});
