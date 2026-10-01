import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageOff, Minus, Plus } from 'lucide-react';
import { useEnumLabels } from '../../i18n/enums';
import type { Pagination as PaginationInfo } from '../../types';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'accent';

const variantStyles: Record<Variant, string> = {
  // orange-700/white = 4.77:1 (AA) — terracotta primary.
  primary: 'bg-orange-700 text-white shadow-sm hover:bg-orange-800 focus-visible:outline-orange-700 active:bg-orange-800',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-orange-700 active:bg-slate-100',
  outline: 'border border-orange-700 bg-white text-orange-700 hover:bg-orange-50 focus-visible:outline-orange-700 active:bg-orange-100',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600 active:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:outline-orange-700 active:bg-slate-200',
  // White CTA on orange-700 surfaces (Home CTA): orange-800 on white = 7.58:1 approx, white outline stays visible.
  accent: 'bg-white text-orange-800 shadow-sm hover:bg-orange-50 focus-visible:outline-white active:bg-orange-100',
};

/** Shared class builder so <Link> CTAs look exactly like <Button>. min-h-11 guarantees 44px touch targets on mobile. */
export function buttonClass(variant: Variant = 'primary', className = ''): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variantStyles[variant]} ${className}`;
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 animate-spin ${className}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  isLoading?: boolean;
};

export function Button({ variant = 'primary', isLoading = false, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button className={buttonClass(variant, className)} disabled={disabled || isLoading} aria-busy={isLoading || undefined} {...props}>
      {isLoading && <Spinner />}
      {children}
    </button>
  );
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function Card({ as: Tag = 'div', className = '', children }: { as?: 'div' | 'li' | 'section' | 'article' | 'aside'; className?: string; children: ReactNode }) {
  return <Tag className={`rounded-2xl border border-slate-200 bg-white shadow-soft ${className}`}>{children}</Tag>;
}

const fieldControl =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldControl} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldControl} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldControl} min-h-20 resize-y ${props.className ?? ''}`} />;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-slate-200 ${className}`} />;
}

/** Image with a neutral fallback: missing URLs or load errors render an icon tile, never a broken image. */
export function SafeImage({ src, alt, className = '', eager = false }: { src?: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span role="img" aria-label={alt} className={`flex items-center justify-center bg-slate-200 text-slate-400 ${className}`}>
        <ImageOff className="h-6 w-6" aria-hidden />
      </span>
    );
  }
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} className={className} />;
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      {icon && <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">{icon}</span>}
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stars({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-amber-500 ${className}`} role="img" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-4 w-4" fill={i <= Math.round(value) ? 'currentColor' : '#E2E8F0'} aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labels = useEnumLabels();
  const map: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800',
    AWAITING_CONFIRMATION: 'bg-orange-100 text-orange-800',
    CONFIRMED: 'bg-emerald-100 text-emerald-800',
    CANCELLED: 'bg-red-100 text-red-800',
    COMPLETED: 'bg-sky-100 text-sky-800',
    PAID: 'bg-emerald-100 text-emerald-800',
    FAILED: 'bg-red-100 text-red-800',
    REFUNDED: 'bg-slate-200 text-slate-700',
  };
  const text =
    status === 'PAID' || status === 'FAILED' || status === 'REFUNDED' || status === 'AWAITING_CONFIRMATION'
      ? labels.paymentStatus(status)
      : labels.bookingStatus(status);
  return <Badge className={map[status] ?? 'bg-slate-100 text-slate-600'}>{text}</Badge>;
}

/** Shared pagination (prev / page x of y / next). Renders nothing on a single page. */
export function Pager({ pagination, onPage, className = '' }: { pagination: PaginationInfo | null; onPage: (page: number) => void; className?: string }) {
  const { t } = useTranslation();
  if (!pagination || pagination.totalPages <= 1) return null;
  return (
    <nav aria-label={t('tours.pageOf', { page: pagination.page, pages: pagination.totalPages })} className={`mt-8 flex flex-wrap items-center justify-center gap-3 ${className}`}>
      <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
        {t('tours.previous')}
      </Button>
      <span className="min-w-24 text-center text-sm tabular-nums text-slate-500">
        {t('tours.pageOf', { page: pagination.page, pages: pagination.totalPages })}
      </span>
      <Button variant="secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>
        {t('tours.next')}
      </Button>
    </nav>
  );
}

/** Stack of open dialogs (topmost last): Escape closes one, scroll unlocks when empty. */
const openDialogs: Array<unknown> = [];

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}

/** Base modal: overlay click + Escape to close, focus trapped + restored, scroll-locked. Inner scrolls so max-w-sm + p-4 never overflows 375px. */
export function Modal({
  open,
  onClose,
  label,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose is read through a ref so re-renders (e.g. typing in a drawer form
  // with an inline onClose) don't re-subscribe Escape/scroll-lock and re-steal focus.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const token = {};
    openDialogs.push(token);
    const isTopmost = () => openDialogs[openDialogs.length - 1] === token;
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog handles keys (stacked dialogs close one at a time).
      if (!isTopmost()) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = focusablesIn(panelRef.current);
        if (items.length === 0) {
          e.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Remember where focus was so it can be restored on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Move keyboard focus into the dialog for screen-reader + Escape users.
    const t = window.setTimeout(() => {
      const items = panelRef.current ? focusablesIn(panelRef.current) : [];
      (items[0] ?? panelRef.current)?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      const i = openDialogs.indexOf(token);
      if (i >= 0) openDialogs.splice(i, 1);
      if (openDialogs.length === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open ]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`my-auto max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl bg-white p-4 shadow-lift outline-none sm:p-6 ${wide ? 'max-w-lg' : 'max-w-sm'}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Standard page container: centered, capped width, responsive gutters. `wide` (~1400px) for dense grids on large screens. */
export function PageContainer({ size = 'narrow', id, className = '', children }: { size?: 'narrow' | 'wide'; id?: string; className?: string; children: ReactNode }) {
  return <div id={id} className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${size === 'wide' ? 'max-w-[1400px]' : 'max-w-7xl'} ${className}`}>{children}</div>;
}

/** Consistent section heading: title + subtitle + optional right-side action. */
export function SectionHeader({ title, subtitle, action, center = false }: { title: string; subtitle?: string; action?: ReactNode; center?: boolean }) {
  return (
    <div className={`flex flex-wrap items-end gap-4 ${center ? 'flex-col items-center text-center' : 'justify-between'}`}>
      <div className={center ? 'mx-auto max-w-2xl' : 'max-w-2xl'}>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{title}</h2>
        {subtitle && <p className="mt-2 text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Brand mark: terracotta compass tile + wordmark. Wrap in a <Link> where needed. */
export function BrandLogo({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`flex items-center justify-center rounded-xl bg-orange-700 text-white ${compact ? 'h-8 w-8' : 'h-9 w-9'} ${dark ? 'bg-white text-orange-700' : ''}`} aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={compact ? 'h-4 w-4' : 'h-5 w-5'}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      </span>
      <span className={`${compact ? 'text-base' : 'text-lg'} font-bold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>Tour Booking</span>
    </span>
  );
}

/** Bordered card shell for admin tables with horizontal scroll on small screens. mt-4 separates it from the header/form above. */
export function TableCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft ${className}`}>{children}</div>;
}

export function Th({ children, right = false, className = '' }: { children: ReactNode; right?: boolean; className?: string }) {
  return <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${right ? 'text-right' : 'text-left'} ${className}`}>{children}</th>;
}

export function Td({ children, right = false, className = '' }: { children: ReactNode; right?: boolean; className?: string }) {
  return <td className={`border-t border-slate-100 px-4 py-3 text-sm ${right ? 'text-right' : ''} ${className}`}>{children}</td>;
}

/** Text actions inside admin tables: 44px touch target, visible focus, consistent hover/disabled. */
export function rowActionClass(tone: 'teal' | 'red' = 'teal'): string {
  const color =
    tone === 'red'
      ? 'text-red-600 hover:bg-red-50 hover:underline'
      : 'text-orange-700 hover:bg-orange-50 hover:underline';
  return `inline-flex min-h-11 items-center rounded-lg px-1.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:no-underline ${color}`;
}

export function RowAction({
  tone = 'teal',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'teal' | 'red' }) {
  return (
    <button type="button" className={`${rowActionClass(tone)} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-500">
        {children}
      </td>
    </tr>
  );
}

/** Visual step tracker (pure presentation, no business logic). Labels collapse under 420px so 375px never overflows. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label="progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={`flex min-w-0 items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? 'bg-orange-700 text-white' : active ? 'bg-orange-700 text-white ring-4 ring-orange-100' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3.5 3.5L13 4.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className={`hidden truncate text-sm font-medium min-[420px]:inline ${active ? 'text-slate-900' : done ? 'text-orange-700' : 'text-slate-400'}`}>
                {label}
              </span>
            </span>
            {i < steps.length - 1 && <span aria-hidden className={`mx-2 h-px flex-1 sm:mx-3 ${i < current ? 'bg-orange-700' : 'bg-slate-200'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Shared quantity stepper (TourDetails guests): 44px buttons, group labelling, consistent disabled/focus. */
export function QuantityStepper({
  value,
  min,
  max,
  disabled = false,
  onChange,
  decreaseLabel,
  increaseLabel,
  labelledBy,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  labelledBy: string;
}) {
  return (
    <div className="flex items-center gap-3" role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={decreaseLabel}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className="w-10 text-center text-lg font-bold tabular-nums" aria-live="polite" aria-atomic="true">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={increaseLabel}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Shared load-error state: EmptyState + retry keeps toast/page-state handling consistent. */
export function RetryState({
  title,
  hint,
  onRetry,
  retryLabel,
}: {
  title: string;
  hint?: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <EmptyState
      title={title}
      hint={hint}
      action={
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      }
    />
  );
}

/** Admin dashboard metric card with icon chip and clear hierarchy. */
export function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700">{icon}</span>
      <p className="mt-4 text-sm text-slate-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
