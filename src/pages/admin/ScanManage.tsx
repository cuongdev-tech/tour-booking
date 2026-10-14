import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '../../services/api';
import { formatDateStr } from '../../i18n/format';
import { formatCurrency, type Booking } from '../../types';
import { Button, Card, Field, Input, RowAction, TableCard, TableEmpty, Td, Th } from '../../components/ui/kit';

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ScanManage() {
  const [code, setCode] = useState('');
  const [sig, setSig] = useState('');
  const [checking, setChecking] = useState(false);
  const [date, setDate] = useState(todayInput());
  const [tourId, setTourId] = useState('');
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  // Paste full verify URL from the QR (…/verify/TB-XXXXXX?t=sig) or code alone.
  const parseInput = (raw: string): { bookingCode: string; sig: string } => {
    const text = raw.trim();
    const m = /verify\/([A-Za-z0-9-]+)/.exec(text);
    const bookingCode = m ? m[1] : text;
    let s = sig.trim();
    try {
      const u = new URL(text);
      s = u.searchParams.get('t') ?? s;
    } catch {
      /* plain code */
    }
    return { bookingCode, sig: s };
  };

  const checkin = async (bookingCode: string, signature?: string) => {
    if (!bookingCode.trim()) {
      toast.error('Vui lòng nhập mã booking');
      return;
    }
    setChecking(true);
    try {
      const { data } = await api.post('/tickets/checkin', {
        code: bookingCode.trim().toUpperCase(),
        ...(signature ? { signature } : {}),
      });
      const b = data.booking as Booking;
      toast.success(`Đã điểm danh ${b.bookingCode}`);
      setRows((prev) => prev.map((r) => (r.bookingCode === b.bookingCode ? { ...r, checkedInAt: b.checkedInAt ?? new Date().toISOString() } : r)));
      setCode('');
      setSig('');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Điểm danh thất bại'));
    } finally {
      setChecking(false);
    }
  };

  const loadManifest = () => {
    setLoading(true);
    api
      .get('/tickets/manifest', { params: { date, ...(tourId.trim() ? { tourId: tourId.trim() } : {}) } })
      .then((r) => setRows(r.data.data ?? []))
      .catch((err) => toast.error(apiErrorMessage(err, 'Không tải được manifest')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadManifest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div>
      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold tracking-tight text-slate-900">Điểm danh nhanh</h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = parseInput(code);
            void checkin(parsed.bookingCode, parsed.sig || undefined);
          }}
        >
          <div className="flex-1">
            <Field label="Mã booking hoặc link QR">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: TB-ABC123 hoặc dán link QR" autoComplete="off" />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Chữ ký vé (tùy chọn)">
              <Input value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Lấy từ ?t= trong QR" autoComplete="off" />
            </Field>
          </div>
          <div className="flex items-end">
            <Button type="submit" isLoading={checking}>Điểm danh</Button>
          </div>
        </form>
      </Card>

      <Card className="mt-4 p-5 sm:p-6">
        <h2 className="font-semibold tracking-tight text-slate-900">Manifest theo ngày</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Ngày">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
          </Field>
          <Field label="Lọc tourId (tùy chọn)">
            <Input value={tourId} onChange={(e) => setTourId(e.target.value)} placeholder="tour id..." className="w-52" />
          </Field>
          <Button variant="secondary" onClick={loadManifest}>Tải manifest</Button>
        </div>
      </Card>

      <TableCard>
        <table className="w-full min-w-200 text-left">
          <thead className="bg-slate-50">
            <tr><Th>Mã</Th><Th>Tour</Th><Th>Khách</Th><Th>Tổng</Th><Th>Thanh toán</Th><Th>Điểm danh</Th><Th right>Thao tác</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={7}>{loading ? 'Đang tải...' : 'Không có booking nào'}</TableEmpty>}
            {rows.map((b) => (
              <tr key={b.id} className="transition-colors hover:bg-slate-50/60">
                <Td className="font-mono font-bold text-slate-900">{b.bookingCode}</Td>
                <Td className="max-w-60"><p className="truncate">{b.tour?.title ?? b.tourId}</p><p className="text-xs tabular-nums text-slate-400">{formatDateStr(b.travelDate)}</p></Td>
                <Td>{b.customerName} · {b.guests} khách</Td>
                <Td className="tabular-nums">{formatCurrency(b.total)}</Td>
                <Td className="text-xs">{b.payment?.status ?? '—'}</Td>
                <Td className="text-xs tabular-nums">{b.checkedInAt ? formatDateStr(b.checkedInAt) : '—'}</Td>
                <Td right>
                  <RowAction disabled={!!b.checkedInAt} onClick={() => void checkin(b.bookingCode)}>
                    {b.checkedInAt ? 'Đã điểm danh' : 'Điểm danh'}
                  </RowAction>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
