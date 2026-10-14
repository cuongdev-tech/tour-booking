import { useEffect, useState } from 'react';
import { Select } from '../ui/kit';
import { fetchRates, getCurrency, setCurrency, type RatesResponse } from '../../utils/currency';

export function CurrencySwitcher({ compact = false }: { compact?: boolean }) {
  const [code, setCode] = useState(getCurrency());
  const [rates, setRates] = useState<RatesResponse | null>(null);

  useEffect(() => {
    void fetchRates().then(setRates);
    const onChange = (e: Event) => setCode((e as CustomEvent<string>).detail ?? getCurrency());
    window.addEventListener('currency:changed', onChange);
    return () => window.removeEventListener('currency:changed', onChange);
  }, []);

  const options = rates ? Object.keys(rates.rates) : ['VND'];

  return (
    <Select
      aria-label="Currency"
      value={code}
      onChange={(e) => {
        setCode(e.target.value);
        setCurrency(e.target.value);
      }}
      className={compact ? 'w-auto min-w-20 px-2 py-2 text-xs' : 'w-auto min-w-24 px-2 py-2 text-sm'}
    >
      {options.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </Select>
  );
}
