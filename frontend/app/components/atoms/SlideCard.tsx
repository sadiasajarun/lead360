import { RiseupMark } from '~/components/atoms/RiseupMark';
import type { Slide } from '~/services/httpServices/presentService';

// A single branded pitch-deck slide, rendered at either thumbnail (grid) or full (presentation) scale.
// Shared by PitchDeckView and SlideViewerModal so the deck looks identical small and large.
export function SlideCard({ slide, index, total, variant }: { slide: Slide; index: number; total: number; variant: 'thumb' | 'full' }) {
  const full = variant === 'full';
  const s = full
    ? { pad: 'p-8 sm:p-12', coverTitle: 'text-[34px] leading-tight', title: 'text-[26px]', sub: 'text-[16px]', bul: 'text-[15px]', th: 'text-[12px]', td: 'text-[13px]', gap: 'mt-3', pl: 'pl-6' }
    : { pad: 'p-[18px]', coverTitle: 'text-[20px]', title: 'text-[15px]', sub: 'text-[12px]', bul: 'text-[11px]', th: 'text-[9px]', td: 'text-[10.5px]', gap: 'mt-1.5', pl: 'pl-[15px]' };
  const hasTable = !!slide.table?.rows?.length;

  return (
    <div
      className={`relative flex aspect-video flex-col overflow-hidden rounded-lg border border-white/10 text-white ${s.pad} ${slide.cover ? 'items-start justify-center' : 'justify-end'}`}
      style={{ background: slide.cover ? 'linear-gradient(135deg,#1A1715,#3a2a20)' : '#161310' }}
    >
      {/* brand + slide number chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-[inherit]" style={{ paddingLeft: full ? 28 : 14, paddingRight: full ? 28 : 14, top: full ? 20 : 12 }}>
        {slide.cover ? <span /> : <RiseupMark size={full ? 'sm' : 'sm'} wordmark={false} />}
        <span className="flex items-center gap-2 text-[#9A948E]" style={{ fontSize: full ? 13 : 10 }}>
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          <span className="inline-block rounded bg-[#EA5400]" style={{ width: full ? 16 : 12, height: full ? 16 : 12 }} />
        </span>
      </div>

      {slide.cover ? (
        <div>
          <RiseupMark size={full ? 'lg' : 'md'} className="mb-4" />
          <div className="mb-2 font-semibold uppercase tracking-[0.14em] text-[#FFB27E]" style={{ fontSize: full ? 13 : 10 }}>Pitch Deck · Riseup Labs</div>
          <h4 className={`font-extrabold ${s.coverTitle}`}>{slide.title}</h4>
          {slide.subtitle && <p className={`mt-2 text-[#d9cfc7] ${s.sub}`}>{slide.subtitle}</p>}
        </div>
      ) : (
        <div className="min-h-0">
          <h4 className={`mb-1 font-semibold ${s.title}`}>{slide.title}</h4>
          {slide.subtitle && <p className={`leading-[1.5] text-[#B8B5B0] ${s.sub}`}>{slide.subtitle}</p>}
          {hasTable ? (
            <div className={`${s.gap} overflow-hidden rounded-md border border-white/10`}>
              <table className="w-full border-collapse text-left">
                {slide.table?.headers?.length ? (
                  <thead>
                    <tr className="bg-white/[0.06] uppercase tracking-wide text-[#9A948E]">
                      {slide.table.headers.map((h, i) => <th key={i} className={`px-2.5 py-1.5 font-semibold ${s.th}`}>{h}</th>)}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {slide.table?.rows?.map((row, i) => (
                    <tr key={i} className="border-t border-white/10 align-top">
                      {row.map((c, j) => <td key={j} className={`px-2.5 py-1.5 leading-[1.4] ${j === 0 ? 'font-medium text-white' : 'text-[#C4C0BB]'} ${s.td}`}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : slide.bullets?.length ? (
            <ul className={`${s.gap} list-disc ${s.pl}`}>
              {slide.bullets.map((b, j) => <li key={j} className={`mb-[3px] leading-[1.45] text-[#C4C0BB] ${s.bul}`}>{b}</li>)}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
