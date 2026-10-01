import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { formatCurrency } from '../../types';
import { Button, Skeleton } from '../../components/ui/kit';

interface CategorySlice {
  category: string;
  total: number;
  count: number;
}

interface TrendMonth {
  key: string;
  label: string;
  total: number;
  orders: number;
}

interface Overview {
  month: number;
  year: number;
  revenue: number;
  orders: number;
  completedOrders: number;
  totalInMonth: number;
  toursActive: number;
  completionRate: number;
  byCategory: CategorySlice[];
  trend: TrendMonth[];
}

const CATEGORY_LABEL: Record<string, string> = {
  Beach: 'Biển',
  Mountains: 'Núi',
  Culture: 'Văn hóa',
  Relaxation: 'Nghỉ dưỡng',
};

const CATEGORY_COLOR: Record<string, string> = {
  Beach: '#e14d7a',
  Mountains: '#f0a3bb',
  Culture: '#c22a54',
  Relaxation: '#f6c9d8',
};
const CATEGORY_FALLBACK = ['#e14d7a', '#f0a3bb', '#c22a54', '#f6c9d8', '#9d174d'];

function fmtShort(v: number): string {
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `${Number(m.toFixed(m >= 10 ? 0 : 1))}tr`;
  }
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}

function Donut({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  const R = 80;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segs = data.map((d, i) => {
    const frac = total > 0 ? d.total / total : 0;
    const seg = {
      ...d,
      frac,
      dash: frac * C,
      gap: C - frac * C,
      offset: -offset * C,
      color: CATEGORY_COLOR[d.category] ?? CATEGORY_FALLBACK[i % CATEGORY_FALLBACK.length],
    };
    offset += frac;
    return seg;
  });
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 200" className="h-56 w-56" role="img" aria-label="Doanh thu theo danh mục">
        <circle cx="100" cy="100" r={R} fill="none" stroke="#f1f5f9" strokeWidth="28" />
        {total > 0 ? (
          segs.map((s) => (
            <circle
              key={s.category}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="28"
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
              transform="rotate(-90 100 100)"
            >
              <title>{`${CATEGORY_LABEL[s.category] ?? s.category}: ${formatCurrency(s.total)} (${Math.round(s.frac * 100)}%)`}</title>
            </circle>
          ))
        ) : (
          <circle cx="100" cy="100" r={R} fill="none" stroke="#e14d7a" strokeWidth="28" opacity={0.9} />
        )}
      </svg>
      {total === 0 ? (
        <p className="mt-2 text-[13px] font-normal text-neutral-400">Chưa có dữ liệu tháng này.</p>
      ) : (
        <ul className="mt-3 w-full max-w-70 space-y-1.5">
          {segs.map((s) => (
            <li key={s.category} className="flex items-center gap-2 text-[13px]">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-normal text-neutral-600">{CATEGORY_LABEL[s.category] ?? s.category}</span>
              <span className="font-bold tabular-nums text-neutral-900">{Math.round(s.frac * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Bars({ trend, month }: { trend: TrendMonth[]; month: number }) {
  const shown = trend.filter((t) => t.total > 0);
  const rows = shown.length > 0 ? shown : trend.slice(Math.max(0, month - 3), month);
  const max = Math.max(1, ...rows.map((t) => t.total));
  // Y ticks: 0 .. max nice steps (giống ảnh: 0, 1tr, 2tr...)
  const steps = 5;
  const ticks = Array.from({ length: steps + 1 }, (_, i) => Math.round((max / steps) * i));
  return (
    <div className="flex gap-2">
      <div className="flex w-16 shrink-0 flex-col-reverse justify-between py-0 text-right text-[11px] font-normal tabular-nums text-neutral-500" aria-hidden>
        {ticks.map((tk) => (
          <span key={tk}>{tk.toLocaleString('vi-VN')}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-0 flex flex-col-reverse justify-between" aria-hidden>
          {ticks.map((tk) => (
            <span key={tk} className="block h-px w-full bg-neutral-100" />
          ))}
        </div>
        <div className="relative flex h-56 items-end gap-4 px-2 pt-2 sm:gap-6" role="img" aria-label="Xu hướng doanh thu">
          {rows.map((t) => {
            const h = t.total > 0 ? Math.max(6, (t.total / max) * 100) : 2;
            const isCurrent = t.key.endsWith(`-${String(month).padStart(2, '0')}`);
            return (
              <div key={t.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <div
                  className="w-full max-w-24 rounded-t-lg"
                  style={{ height: `${(h / 100) * 200}px`, backgroundColor: isCurrent ? '#d63a5e' : '#e8a4b8' }}
                  title={`${t.label}: ${formatCurrency(t.total)}`}
                />
                <span className="text-[12px] font-normal whitespace-nowrap text-neutral-500">{t.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const load = (m: number = month, y: number = year) => {
    setFailed(false);
    api
      .get('/admin/revenue/overview', { params: { month: m, year: y } })
      .then((r) => setData(r.data))
      .catch(() => {
        setData(null);
        setFailed(true);
      });
  };
  useEffect(() => {
    void load(month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

  const fileBase = () =>
    data ? `bao-cao-doanh-thu-${data.year}-${String(data.month).padStart(2, '0')}` : 'bao-cao-doanh-thu';

  /** Excel (.xls mở trực tiếp bằng Excel, không cần thêm lib). */
  const exportExcel = () => {
    if (!data) return;
    const esc = (v: string | number) =>
      String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const catRows = data.byCategory
      .map((c) => `<tr><td>${esc(CATEGORY_LABEL[c.category] ?? c.category)}</td><td>${c.total}</td><td>${c.count}</td></tr>`)
      .join('');
    const trendRows = data.trend
      .map((t) => `<tr><td>${esc(t.label)}</td><td>${t.total}</td><td>${t.orders}</td></tr>`)
      .join('');
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
      `<head><meta charset="UTF-8"></head><body>` +
      `<table border="1"><tr><th colspan="3">TONG QUAN KINH DOANH - Thang ${data.month}/${data.year}</th></tr>` +
      `<tr><td>Doanh thu (thang chon)</td><td>${data.revenue}</td><td></td></tr>` +
      `<tr><td>Tong don (thang chon)</td><td>${data.orders}</td><td></td></tr>` +
      `<tr><td>Don hoan thanh</td><td>${data.completedOrders}</td><td></td></tr>` +
      `<tr><td>Tour dang ban</td><td>${data.toursActive}</td><td></td></tr>` +
      `<tr><td>Hieu suat</td><td>${data.completionRate}%</td><td></td></tr></table><br>` +
      `<table border="1"><tr><th colspan="3">Doanh thu theo danh muc</th></tr>` +
      `<tr><th>Danh muc</th><th>Tong</th><th>So don</th></tr>${catRows}</table><br>` +
      `<table border="1"><tr><th colspan="3">Xu huong doanh thu nam ${data.year}</th></tr>` +
      `<tr><th>Thang</th><th>Tong</th><th>So don</th></tr>${trendRows}</table>` +
      `</body></html>`;
    downloadBlob(new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${fileBase()}.xls`);
  };

  /** PDF tiếng Việt (jsPDF + Be Vietnam Pro, lazy-load như hóa đơn). */
  const exportPDF = async () => {
    if (!data) return;
    const [{ jsPDF }, { default: regFont }, { default: boldFont }] = await Promise.all([
      import('jspdf'),
      import('../../assets/fonts/beVietnamProRegular'),
      import('../../assets/fonts/beVietnamProBold'),
    ]);
    const doc = new jsPDF();
    doc.addFileToVFS('BeVN-Regular.ttf', regFont);
    doc.addFileToVFS('BeVN-Bold.ttf', boldFont);
    doc.addFont('BeVN-Regular.ttf', 'BeVN', 'normal');
    doc.addFont('BeVN-Bold.ttf', 'BeVN', 'bold');

    const W = 210;
    let y = 20;
    doc.setFont('BeVN', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(17, 17, 17);
    doc.text('TỔNG QUAN KINH DOANH', 14, y);
    y += 7;
    doc.setFont('BeVN', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`Tháng ${data.month}/${data.year} - Tour Booking`, 14, y);
    y += 9;

    doc.setFont('BeVN', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const summary: Array<[string, string]> = [
      ['Doanh thu (tháng chọn)', `${formatCurrency(data.revenue)}`],
      ['Tổng đơn (tháng chọn)', `${data.orders} đơn`],
      ['Đơn hoàn thành', `${data.completedOrders} đơn`],
      ['Tour đang bán', `${data.toursActive} tour`],
      ['Hiệu suất', `${data.completionRate.toFixed(1)}%`],
    ];
    for (const [k, v] of summary) {
      doc.text(k, 14, y);
      doc.text(v, W - 14, y, { align: 'right' });
      y += 6;
    }
    const needPage = (h: number) => {
      if (y + h > 280) {
        doc.addPage();
        y = 20;
      }
    };

    y += 4;
    needPage(12);
    doc.setFont('BeVN', 'bold');
    doc.text('Doanh thu theo danh mục', 14, y);
    y += 6;
    doc.setFont('BeVN', 'normal');
    if (data.byCategory.length === 0) {
      doc.text('Chưa có dữ liệu tháng này.', 14, y);
      y += 6;
    }
    for (const c of data.byCategory) {
      needPage(6);
      doc.text(CATEGORY_LABEL[c.category] ?? c.category, 14, y);
      doc.text(`${formatCurrency(c.total)} (${c.count} đơn)`, W - 14, y, { align: 'right' });
      y += 6;
    }

    y += 4;
    needPage(12);
    doc.setFont('BeVN', 'bold');
    doc.text(`Xu hướng doanh thu năm ${data.year}`, 14, y);
    y += 6;
    doc.setFont('BeVN', 'normal');
    for (const t of data.trend) {
      needPage(6);
      doc.text(t.label, 14, y);
      doc.text(`${formatCurrency(t.total)} (${t.orders} đơn)`, W - 14, y, { align: 'right' });
      y += 6;
    }
    doc.save(`${fileBase()}.pdf`);
    setExportOpen(false);
  };

  return (
    <div className="min-w-0 antialiased">
      {/* Header giống ảnh mẫu quần áo: tiêu đề in hoa đậm, subtitle xám nhỏ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px] leading-7 font-extrabold tracking-tight text-neutral-900 uppercase">Tổng quan kinh doanh</h2>
          <p className="mt-1 text-[13px] font-normal text-neutral-400">Doanh thu đơn hoàn thành - Số chỗ - Đối soát 24h/3-4 ngày</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-normal text-neutral-500">Thời gian:</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            aria-label="Chọn tháng"
            className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-700 outline-none focus:border-neutral-900"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                Tháng {m}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Chọn năm"
            className="min-h-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] font-medium text-neutral-700 outline-none focus:border-neutral-900"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-700"
            >
              Xuất báo cáo <span aria-hidden className="text-[11px]">▼</span>
            </button>
            {exportOpen && (
              <>
                <button type="button" aria-label="Đóng" className="fixed inset-0 z-10 cursor-default" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
                  <button type="button" onClick={exportExcel} className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-neutral-50">
                    Xuất Excel
                  </button>
                  <button type="button" onClick={() => void exportPDF()} className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-neutral-50">
                    Xuất PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {failed ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">Không tải được dữ liệu tổng quan</p>
          <Button variant="secondary" onClick={() => load()} className="mt-4">
            Thử lại
          </Button>
        </div>
      ) : !data ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          {/* 4 thẻ đen giống ảnh quần áo: nền đen, chữ trắng, bo góc, vòng tròn mờ */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'DOANH THU (THÁNG CHỌN)',
                value: `${formatCurrency(data.revenue).replace('₫', '').trim()} đ`,
                hint: 'Thực thu đã thanh toán',
              },
              {
                label: 'TỔNG ĐƠN (THÁNG CHỌN)',
                value: `${data.orders} đơn`,
                hint: 'Đã ghi nhận trong tháng',
              },
              {
                label: 'TOUR ĐANG BÁN',
                value: `${data.toursActive} tour`,
                hint: 'Đủ các danh mục tour',
              },
              {
                label: 'HIỆU SUẤT SHOP',
                value: `${data.completionRate.toFixed(1)}%`,
                hint: data.completionRate >= 50 ? 'Hoạt động tốt' : 'Hoạt động ổn định',
              },
            ].map((c) => (
              <div key={c.label} className="relative overflow-hidden rounded-xl bg-[#131313] p-5 text-white">
                <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/70">{c.label}</p>
                <p className="mt-2 text-[22px] leading-7 font-extrabold tabular-nums">{c.value}</p>
                <p className="mt-1 text-[12px] font-normal text-white/50">{c.hint}</p>
              </div>
            ))}
          </div>

          {/* 2 biểu đồ */}
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6 xl:col-span-2">
              <h3 className="text-[15px] font-bold text-neutral-900">Doanh thu theo Danh mục</h3>
              <p className="mt-0.5 text-[13px] font-normal text-neutral-400">Tỷ lệ đóng góp của từng loại tour</p>
              <div className="mt-4">
                <Donut data={data.byCategory} />
              </div>
              {data.byCategory.length > 0 && (
                <p className="mt-3 text-center text-[12px] font-normal tabular-nums text-neutral-400">
                  Tổng {formatCurrency(data.byCategory.reduce((s, d) => s + d.total, 0))} · {fmtShort(data.revenue)} · {data.orders} đơn
                </p>
              )}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6 xl:col-span-3">
              <h3 className="text-[15px] font-bold text-neutral-900">Xu hướng Doanh thu</h3>
              <p className="mt-0.5 text-[13px] font-normal text-neutral-400">Biểu đồ tăng trưởng dòng tiền qua các tháng</p>
              <div className="mt-4">
                <Bars trend={data.trend} month={data.month} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
