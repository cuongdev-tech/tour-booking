import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe } from 'lucide-react';
import i18n from '../../i18n';
import { LANGUAGES, getLanguage, setLanguage, type Language } from '../../i18n';

/** Dropdown with flag + language name. Persists to localStorage (tourbooking_lang). Keyboard: Enter/Space/ArrowDown opens, arrows move, Escape closes. */
export function LanguageSwitcher({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Language>(getLanguage());
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen((was) => {
          if (was) triggerRef.current?.focus();
          return false;
        });
      }
    };
    // Multiple switchers exist (navbar desktop/mobile + footer): keep every
    // instance in sync when any one changes the language.
    const sync = (lng: string) => setCurrent(lng as Language);
    i18n.on('languageChanged', sync);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      i18n.off('languageChanged', sync);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const active = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  const pick = (code: Language) => {
    setLanguage(code);
    setCurrent(code);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const focusOption = (index: number) => {
    const options = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
    if (!options || options.length === 0) return;
    const clamped = (index + options.length) % options.length;
    options[clamped].focus();
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
            window.setTimeout(() => focusOption(0), 0);
          }
        }}
        className={`flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 active:bg-slate-200 ${compact ? 'min-w-11 justify-center' : ''} ${
          onDark
            ? 'text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-orange-400 active:bg-white/10'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-orange-700'
        }`}
        aria-label={t('nav.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="language-listbox"
      >
        {compact ? <Globe className="h-5 w-5" aria-hidden /> : <span className="text-base leading-none" aria-hidden>{active.flag}</span>}
        {!compact && <span className="hidden lg:inline">{active.label}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          ref={listRef}
          id="language-listbox"
          role="listbox"
          aria-label={t('nav.language')}
          onKeyDown={(e) => {
            const options = listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]');
            const idx = options ? Array.from(options).indexOf(document.activeElement as HTMLButtonElement) : -1;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusOption(idx + 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              focusOption(idx - 1);
            } else if (e.key === 'Home') {
              e.preventDefault();
              focusOption(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              focusOption((options?.length ?? 1) - 1);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
              triggerRef.current?.focus();
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
          className="absolute right-0 z-50 mt-1 max-h-[calc(100dvh-4rem)] w-44 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lift"
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              role="option"
              aria-selected={l.code === current}
              className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-700 ${
                l.code === current ? 'font-semibold text-orange-700' : 'text-slate-700'
              }`}
            >
              <span className="text-base leading-none" aria-hidden>{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === current && <Check className="h-4 w-4" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
