import { afterAll, describe, expect, it } from 'vitest';
import {
  adminDeleteContactMessage,
  adminDeleteContactReply,
  adminReplyContact,
  createContactMessage,
} from './contact.service.js';

// Tin nhắn tạm với email duy nhất, dọn sau test.
const email = `contact-test-${Date.now()}@example.com`;
let messageId = '';

async function ensureMessage(): Promise<string> {
  if (messageId) return messageId;
  const m = await createContactMessage({
    name: 'Contact Test',
    email,
    message: 'Giờ mở cửa thế nào?',
  });
  messageId = m.id;
  return messageId;
}

afterAll(async () => {
  if (messageId) await adminDeleteContactMessage(messageId).catch(() => undefined);
});

describe('adminReplyContact', () => {
  it('lưu reply + đánh dấu đã đọc', async () => {
    const id = await ensureMessage();
    const updated = await adminReplyContact(id, '  Mở cửa 8h-22h mỗi ngày  ');
    expect(updated.adminReply).toBe('Mở cửa 8h-22h mỗi ngày');
    expect(updated.adminRepliedAt).not.toBeNull();
    expect(updated.isRead).toBe(true);
  });

  it('chặn reply rỗng / quá dài / id lạ', async () => {
    const id = await ensureMessage();
    await expect(adminReplyContact(id, '   ')).rejects.toMatchObject({ statusCode: 400 });
    await expect(adminReplyContact(id, 'a'.repeat(2001))).rejects.toMatchObject({ statusCode: 400 });
    await expect(adminReplyContact('cm00000000000000000000000', 'hi')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('xóa được reply', async () => {
    const id = await ensureMessage();
    const updated = await adminDeleteContactReply(id);
    expect(updated.adminReply).toBeNull();
    expect(updated.adminRepliedAt).toBeNull();
  });
});
