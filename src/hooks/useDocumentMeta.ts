import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const SUFFIX = 'Tour Booking';

/** Per-page <title> + meta description (lightweight; no head-manager dependency). */
export function useDocumentMeta(title: string, description?: string) {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.title = title ? `${title} — ${SUFFIX}` : SUFFIX;
    const tag = document.querySelector('meta[name="description"]');
    if (tag) {
      // Pages without an explicit description (e.g. NotFound) must not keep the
      // previous page's description stale in crawlers/share previews.
      tag.setAttribute('content', description ?? `${title ? `${title} — ` : ''}${SUFFIX}`);
    }
  }, [title, description, i18n.language]);
}
