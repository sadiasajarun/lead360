import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { SlideCard } from '~/components/atoms/SlideCard';
import { RiseupMark } from '~/components/atoms/RiseupMark';
import type { Slide } from '~/services/httpServices/presentService';

/** Full-screen viewer for generated pitch-deck slides with prev/next navigation. */
interface SlideViewerModalProps {
  slides: Slide[];
  initialIndex: number;
  onClose: () => void;
}

export function SlideViewerModal({ slides, initialIndex, onClose }: SlideViewerModalProps) {
  const [index, setIndex] = useState(initialIndex);
  const slide = slides[index];
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(slides.length - 1, i + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, slides.length]);

  if (!slide) return null;

  const navBtn = 'grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border border-white/20 text-white hover:bg-white/10 disabled:cursor-default disabled:opacity-30';

  return (
    <div data-testid="slide-viewer-modal" role="dialog" aria-modal="true" aria-label="Pitch deck slide viewer"
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4 sm:p-8" onClick={onClose}>
      <div className="mb-3 flex items-center justify-between text-white" onClick={(e) => e.stopPropagation()}>
        <span data-testid="slide-viewer-counter" className="text-[13px] tabular-nums text-[#C4C0BB]">
          Slide {index + 1} of {slides.length}
        </span>
        <button data-testid="slide-viewer-close" onClick={onClose} aria-label="Close"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/20 hover:bg-white/10">
          <X size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 sm:gap-5" onClick={(e) => e.stopPropagation()}>
        <button data-testid="slide-viewer-prev" onClick={prev} disabled={index === 0} aria-label="Previous slide" className={navBtn}>
          <ChevronLeft size={20} />
        </button>

        <div className="w-full max-w-[980px]">
          <SlideCard slide={slide} index={index} total={slides.length} variant="full" />
          <div className="mt-3 flex items-center justify-between px-1">
            <RiseupMark size="sm" />
            <span className="text-[12px] text-[#9A948E]">Use ← → to navigate · Esc to exit</span>
          </div>
        </div>

        <button data-testid="slide-viewer-next" onClick={next} disabled={index === slides.length - 1} aria-label="Next slide" className={navBtn}>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
