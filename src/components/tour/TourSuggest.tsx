import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { api } from '../../services/api';
import { formatCurrency, type Tour } from '../../types';
import { Input } from '../ui/kit';
import { useDebounce } from '../../hooks/useDebounce';

/**
 * Tour name autocomplete: debounced suggestions from the existing /tours?q=
 * endpoint (no backend change). Full keyboard support; Enter with no
 * selection falls through to the surrounding form submit.
 */
export function TourSuggest({
  id,
  value,
  onChange,
  onPick,
  placeholder,
  inputClassName = '',
  startAdornment,
  variant = 'boxed',
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  onPick: (tour: Tour) => void;
  placeholder?: string;
  inputClassName?: string;
  startAdornment?: ReactNode;
  variant?: 'boxed' | 'bare';
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Tour[]>([]);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounce(value, 250);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    api
      .get('/tours', { params: { q, limit: 6 }, signal: ctrl.signal })
      .then((res) => {
        setItems(res.data.data ?? []);
        setActive(-1);
        setOpen(true);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [debounced]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const show = open && items.length > 0;

  const pick = (tour: Tour) => {
    setOpen(false);
    onPick(tour);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!show) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && active >= 0 && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const pickProps = {
    id,
    value,
    onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    onFocus: () => {
      if (items.length > 0) setOpen(true);
    },
    onKeyDown,
    placeholder,
    autoComplete: 'off' as const,
    role: 'combobox' as const,
    'aria-expanded': show,
    'aria-controls': `${id}-list`,
    'aria-activedescendant': active >= 0 ? `${id}-opt-${active}` : undefined,
  };

  return (
    <div
      ref={boxRef}
      className="relative"
      onBlur={(e) => {
        // Keyboard users tabbing past the field: close the list (mouse users
        // are covered by mousedown-outside + option onMouseDown).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {startAdornment}
      {variant === 'bare' ? (
        <input {...pickProps} className={inputClassName} />
      ) : (
        <Input
          {...pickProps}
          className={inputClassName}
        />
      )}
      {show && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lift"
        >
          {items.map((tour, i) => (
            <li key={tour.id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(tour);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-700 ${
                  i === active ? 'bg-orange-50' : ''
                }`}
              >
                {tour.images[0] && (
                  <img src={tour.images[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{tour.title}</span>
                  <span className="block text-xs tabular-nums text-orange-700">{formatCurrency(tour.price)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
