import i18n from '../i18n';
import { formatCurrency, type Booking } from '../types';
import { formatDateStr } from '../i18n/format';

/**
 * Booking invoice PDF with full Vietnamese diacritics (Be Vietnam Pro, OFL).
 * jsPDF + fonts are lazy-imported so the ~700KB payload only loads on click.
 * Status labels come from the caller (i18n lives in React hooks).
 */
export async function downloadInvoice(
  booking: Booking,
  labels: { bookingStatus: string; paymentStatus: string },
): Promise<void> {
  const [{ jsPDF }, { default: regFont }, { default: boldFont }] = await Promise.all([
    import('jspdf'),
    import('../assets/fonts/beVietnamProRegular'),
    import('../assets/fonts/beVietnamProBold'),
  ]);
  // QR vé điện tử (verify công khai) — chỉ in khi vé đã dùng được
  // (PAID hoặc CASH); thẻ/chuyển khoản chưa trả thì chưa có vé.
  // Lỗi thì bỏ qua, hóa đơn vẫn đầy đủ.
  let qrData = '';
  let verifyUrl = `${window.location.origin}/verify/${booking.bookingCode}`;
  const sig = (booking as unknown as { ticketSignature?: string | null }).ticketSignature;
  if (sig) verifyUrl = `${verifyUrl}?t=${encodeURIComponent(sig)}`;
  const ticketUsable =
    booking.bookingStatus !== 'CANCELLED' &&
    (booking.payment?.status === 'PAID' || booking.payment?.method === 'CASH');
  if (ticketUsable) {
    try {
      const { default: QRCode } = await import('qrcode');
      qrData = await QRCode.toDataURL(verifyUrl, {
        width: 200,
        margin: 1,
      });
    } catch {
      qrData = '';
    }
  }
  const t = i18n.t.bind(i18n);
  const doc = new jsPDF();
  doc.addFileToVFS('BeVN-Regular.ttf', regFont);
  doc.addFileToVFS('BeVN-Bold.ttf', boldFont);
  doc.addFont('BeVN-Regular.ttf', 'BeVN', 'normal');
  doc.addFont('BeVN-Bold.ttf', 'BeVN', 'bold');

  const W = 210;
  let y = 22;
  doc.setFont('BeVN', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(194, 65, 12);
  doc.text('Tour Booking', 14, y);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(t('bookings.invoice'), W - 14, y, { align: 'right' });
  y += 4;
  doc.setDrawColor(194, 65, 12);
  doc.line(14, y, W - 14, y);
  y += 10;

  doc.setFontSize(11);
  doc.text(booking.bookingCode, 14, y);
  y += 8;
  doc.setFont('BeVN', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);

  const childCount = booking.children ?? 0;
  const adultCount = booking.adults ?? booking.guests - childCount;
  const bookingAddons = Array.isArray(booking.addons) ? booking.addons : [];
  const rows: Array<[string, string]> = [
    [t('bookingSuccess.tour'), booking.tour?.title ?? booking.tourId],
    [t('bookingSuccess.travelDate'), formatDateStr(booking.travelDate)],
    [
      t('bookingSuccess.guests'),
      `${t('bookings.guestsSuffix', { count: booking.guests })}${childCount > 0 ? ` (${adultCount} NL · ${childCount} TE)` : ''}`,
    ],
    [t('bookingSuccess.booking'), labels.bookingStatus],
    [t('bookingSuccess.payment'), labels.paymentStatus],
    [`${t('checkout.subtotal')}`, formatCurrency(booking.subtotal)],
  ];
  for (const a of bookingAddons) {
    rows.push([`+ ${a.name}`, `+${formatCurrency(a.perPerson ? a.price * booking.guests : a.price)}`]);
  }
  // NOTE: no separate addonsTotal line — the per-addon rows above already sum
  // to it (backend total = subtotal - discount + addonsTotal).
  if (booking.discount > 0) {
    rows.push([`${t('checkout.discount')}${booking.coupon ? ` (${booking.coupon.code})` : ''}`, `-${formatCurrency(booking.discount)}`]);
  }
  if ((booking.loyaltyDiscount ?? 0) > 0) {
    rows.push([`Loyalty${booking.loyaltyUsed ? ` (${booking.loyaltyUsed} điểm)` : ''}`, `-${formatCurrency(booking.loyaltyDiscount ?? 0)}`]);
  }
  if (booking.isPrivate && (booking.privateSurcharge ?? 0) > 0) {
    rows.push(['Private tour', `+${formatCurrency(booking.privateSurcharge ?? 0)}`]);
  }
  if (booking.comboId) {
    rows.push(['Combo', booking.comboGroup ? `Nhóm ${booking.comboGroup}` : booking.comboId]);
  }
  if ((booking.vatAmount ?? 0) > 0) {
    // VAT-inclusive pricing: informational only, already part of the total.
    const vatLabel = booking.vatName ? `VAT đã gồm${booking.vatTaxCode ? ` · MST ${booking.vatTaxCode}` : ''}` : 'VAT đã gồm trong tổng';
    rows.push([vatLabel, `${formatCurrency(booking.vatAmount ?? 0)}`]);
  }
  for (const [label, value] of rows) {
    const lines = doc.splitTextToSize(value, 120);
    doc.text(label, 14, y);
    doc.setTextColor(15, 23, 42);
    doc.text(lines, W - 14, y, { align: 'right' });
    y += 6 + (lines.length - 1) * 5;
    doc.setTextColor(71, 85, 105);
  }
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y, W - 14, y);
  y += 8;
  doc.setFont('BeVN', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(t('checkout.total'), 14, y);
  doc.setTextColor(194, 65, 12);
  doc.text(formatCurrency(booking.total), W - 14, y, { align: 'right' });
  y += 10;

  if (qrData) {
    // QR + link xác thực ở cuối hóa đơn để soát vé ở điểm đón.
    try {
      doc.addImage(qrData, 'PNG', 14, y, 34, 34);
    } catch {
      /* QR trang trí — bỏ qua khi jsPDF không nhúng được */
    }
    doc.setFont('BeVN', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(verifyUrl, 52, y + 8, { maxWidth: 140 });
    doc.text(t('verify.title', { defaultValue: 'Xác thực vé' }), 52, y + 15);
  }

  doc.save(`invoice-${booking.bookingCode}.pdf`);
}
