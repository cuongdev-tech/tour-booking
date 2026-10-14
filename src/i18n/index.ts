import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE, LANG_STORAGE_KEY, LANGUAGES, type Language, type Translation } from './types';
import vi from './locales/vi';
import en from './locales/en';
import ja from './locales/ja';
import ko from './locales/ko';
import zh from './locales/zh';

export { LANGUAGES, LANG_STORAGE_KEY, DEFAULT_LANGUAGE };
export type { Language, Translation };

function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && (LANGUAGES.some((l) => l.code === saved))) return saved as Language;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_LANGUAGE;
}

const resources: Record<Language, { translation: Translation }> = {
  vi: { translation: vi },
  en: { translation: en },
  ja: { translation: ja },
  ko: { translation: ko },
  zh: { translation: zh },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}

export function setLanguage(lng: Language): void {
  void i18n.changeLanguage(lng);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng);
  } catch {
    /* storage unavailable */
  }
  try {
    if (typeof document !== 'undefined') document.documentElement.lang = lng;
  } catch {
    /* non-DOM environment */
  }
}

export function getLanguage(): Language {
  return (i18n.language as Language) ?? DEFAULT_LANGUAGE;
}

export default i18n;
