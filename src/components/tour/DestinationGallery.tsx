import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Camera, ChevronLeft, ChevronRight, Expand, MapPin, X } from 'lucide-react';
import { destinationGallery } from '../../data/destinations';
import { Button, Modal } from '../ui/kit';

/**
 * Thẻ điểm đến xem được nhiều ảnh: carousel ngay trên thẻ + lightbox phóng to.
 * Dùng chung cho trang Home (featured) và Destinations (tất cả).
 */
export function DestinationCard({
  name,
  count,
  tall = false,
  compact = false,
}: {
  name: string;
  count?: number;
  tall?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const images = destinationGallery(name);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  // Đổi điểm đến -> quay về ảnh đầu (tránh index kẹt ở gallery cũ ngắn hơn).
  useEffect(() => setIndex(0), [name]);
  useEffect(() => {
    if (index > images.length - 1) setIndex(0);
  }, [index, images.length]);

  const prev = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation();
      e?.preventDefault();
      setIndex((i) => (i - 1 + images.length) % images.length);
    },
    [images.length],
  );
  const next = useCallback(
    (e?: React.SyntheticEvent) => {
      e?.stopPropagation();
      e?.preventDefault();
      setIndex((i) => (i + 1) % images.length);
    },
    [images.length],
  );

  const toursHref = `/tours?destination=${encodeURIComponent(name)}`;
  const multi = images.length > 1;

  return (
    <>
      <div className={`group relative overflow-hidden rounded-3xl bg-slate-100 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift focus-within:shadow-lift ${compact ? 'h-56 md:h-64 lg:h-72' : 'h-72 md:h-64 lg:h-72'}`}>
        {/* Ảnh hiện tại — bấm để phóng to xem tất cả */}
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label={`${name} — ${t('tours.showResults', { count: images.length })}`}
          className="absolute inset-0 h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          {images.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt={i === index ? name : ''}
              aria-hidden={i !== index}
              loading="lazy"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            />
          ))}
        </button>
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-slate-900/10 transition-colors group-hover:bg-slate-900/0" />

        {/* Nút prev/next — stopPropagation để không mở lightbox nhầm */}
        {multi && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label={t('tours.previous')}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-100 backdrop-blur transition-all hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label={t('tours.next')}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-100 backdrop-blur transition-all hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}

        {/* Badge số tour + số ảnh */}
        <span className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-1.5">
          {count !== undefined && (
            <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-900 shadow-sm">
              {t('destinations.toursCount', { count })}
            </span>
          )}
          {multi && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white backdrop-blur">
              <Camera className="h-3 w-3" aria-hidden />
              {index + 1}/{images.length}
            </span>
          )}
        </span>
        {/* Nút phóng to */}
        <span className="pointer-events-none absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition-all md:opacity-0 md:group-hover:opacity-100">
          <Expand className="h-4 w-4" aria-hidden />
        </span>

        {/* Dots */}
        {multi && (
          <span className="absolute inset-x-0 top-2 flex justify-center gap-1" aria-hidden>
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </span>
        )}

        {/* Dải tên + link xem tour */}
        <span className={`absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-slate-900/45 backdrop-blur-[1px] ${compact ? 'px-4 pb-4 pt-10' : 'px-5 pb-5 pt-12'}`}>
          {compact ? (
            <span className="min-w-0 truncate text-[15px] font-bold text-white">{name}</span>
          ) : (
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {t('nav.destinations')}
              </span>
              <span className="mt-1 block truncate text-xl font-bold text-white">{name}</span>
            </span>
          )}
          <Link
            to={toursHref}
            aria-label={`${t('home.viewAll')} — ${name}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition-all hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </span>
      </div>

      <DestinationLightbox
        name={name}
        images={images}
        index={index}
        open={lightbox}
        onClose={() => setLightbox(false)}
        onIndex={setIndex}
        tall={tall}
      />
    </>
  );
}

/** Lightbox phóng to: ảnh lớn + prev/next + dots + nút xem tour. */
function DestinationLightbox({
  name,
  images,
  index,
  open,
  onClose,
  onIndex,
  tall = false,
}: {
  name: string;
  images: string[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndex: (i: number) => void;
  tall?: boolean;
}) {
  const { t } = useTranslation();
  const multi = images.length > 1;
  const prev = () => onIndex((index - 1 + images.length) % images.length);
  const next = () => onIndex((index + 1) % images.length);

  // Phím ←/→ chuyển ảnh trong lightbox (Escape đã có trong Modal).
  useEffect(() => {
    if (!open || !multi) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <Modal open={open} onClose={onClose} label={name} wide>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tracking-tight text-slate-900">{name}</p>
          {multi && (
            <p className="mt-0.5 text-xs tabular-nums text-slate-400">
              {index + 1} / {images.length}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('bookings.dialogCancel')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className={`relative mt-3 overflow-hidden rounded-2xl bg-slate-100 ${tall ? 'h-80 sm:h-96' : 'h-64 sm:h-80'}`}>
        {images.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt={i === index ? `${name} — ${i + 1}/${images.length}` : ''}
            aria-hidden={i !== index}
            loading={i === 0 ? 'eager' : 'lazy'}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />
        ))}
        {multi && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label={t('tours.previous')}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-all hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label={t('tours.next')}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-all hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails để nhảy nhanh tới ảnh bất kỳ */}
      {multi && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={name}>
          {images.map((src, i) => (
            <button
              key={`${src}-thumb-${i}`}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`${name} — ${i + 1}/${images.length}`}
              aria-pressed={i === index}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-[3px] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
                i === index ? 'border-orange-700' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link to={`/tours?destination=${encodeURIComponent(name)}`} className="w-full sm:w-auto">
          <Button className="w-full px-6">
            {t('home.viewAll')} <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </Link>
        <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
          {t('bookings.dialogCancel')}
        </Button>
      </div>
    </Modal>
  );
}
