import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { LANGUAGES, getLanguage, setLanguage, type Language } from '../../i18n';

/** Dropdown with flag + language name. Persists to localStorage (tourbooking_lang). */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Language>(getLanguage());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const active = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  const pick = (code: Language) => {
    setLanguage(code);
    setCurrent(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        aria-label={t('nav.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {compact ? <Globe className="h-5 w-5" /> : <span className="text-base leading-none">{active.flag}</span>}
        {!compact && <span className="hidden lg:inline">{active.label}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              role="option"
              aria-selected={l.code === current}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                l.code === current ? 'font-semibold text-teal-700' : 'text-slate-700'
              }`}
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === current && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
