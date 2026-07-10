import { useState } from 'react';
import type { ReactNode } from 'react';
import { NotebookPen, Presentation, Sparkles, Loader2, RefreshCw, Maximize2, Play } from 'lucide-react';
import { SlideViewerModal } from '~/components/modals/SlideViewerModal';
import { RiseupMark } from '~/components/atoms/RiseupMark';
import { SlideCard } from '~/components/atoms/SlideCard';
import type { SalesBrief, Slide } from '~/services/httpServices/presentService';

// Shared empty state (matches .genempty in the design).
function GenEmpty({ icon: Icon, title, desc, cta, onGenerate, generating, testid }:
  { icon: typeof NotebookPen; title: string; desc: string; cta: string; onGenerate: () => void; generating: boolean; testid: string }) {
  return (
    <div data-testid={testid} className="rounded-[10px] border border-dashed border-[#D4D1CC] bg-[#F4F4F2] px-6 py-14 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[#E8E6E3] bg-white text-[#EA5400]"><Icon size={22} /></div>
      <div className="text-[16px] font-semibold">{title}</div>
      <p className="mx-auto mb-[18px] mt-1.5 max-w-[460px] text-[13.5px] leading-relaxed text-[#6B6660]">{desc}</p>
      <button data-testid={`${testid}-generate`} disabled={generating} onClick={onGenerate}
        className="mx-auto inline-flex h-10 items-center gap-1.5 rounded-md bg-[#EA5400] px-4 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50">
        {generating ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Sparkles size={16} /> {cta}</>}
      </button>
    </div>
  );
}

function Sec({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
        <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-[#EA5400]/[0.08] text-[11px] font-bold text-[#EA5400]">{n}</span>{title}
      </h3>
      <div className="text-[13.5px] leading-[1.6] text-[#6B6660]">{children}</div>
    </div>
  );
}
const Bullets = ({ items }: { items?: string[] }) => (
  <ul className="list-disc pl-[18px]">{(items ?? []).map((t, i) => <li key={i} className="mb-1.5">{t}</li>)}</ul>
);

export function SalesBriefView({ brief, onGenerate, generating }: { brief?: SalesBrief | null; onGenerate: () => void; generating: boolean }) {
  if (!brief || Object.keys(brief).length === 0) {
    return <GenEmpty testid="brief-empty" icon={NotebookPen} title="No sales brief yet"
      desc="Generate a non-technical pitch pack — plain-English summary, talking points, objection handling and a ready-made 60-second pitch."
      cta="Generate brief" onGenerate={onGenerate} generating={generating} />;
  }
  return (
    <div data-testid="brief-content">
      {/* Branded header — pairs with the pitch deck (same story, one look) */}
      <div className="relative mb-6 overflow-hidden rounded-2xl px-6 py-5 text-white" style={{ background: 'radial-gradient(120% 160% at 0% 0%, #2a2420 0%, #1A1715 60%)' }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-50 blur-3xl" style={{ background: 'linear-gradient(120deg,#EA5400,#FF8A3D)' }} />
        <div className="relative flex items-center justify-between gap-3">
          <RiseupMark size="md" />
          <span className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#FFB27E]">Internal Sales Brief</span>
        </div>
        <p className="relative mt-3 max-w-[560px] text-[13px] leading-relaxed text-[#d9cfc7]">Your talking track for the meeting — the same story the pitch deck presents. Skim it, then present the deck.</p>
      </div>
      {brief.proposing && <Sec n={1} title="What we're proposing"><p>{brief.proposing}</p></Sec>}
      {brief.whyMatters && <Sec n={2} title="Why it matters to this client"><p>{brief.whyMatters}</p></Sec>}
      {brief.highlights?.length ? <Sec n={3} title="Key highlights"><Bullets items={brief.highlights} /></Sec> : null}
      {brief.talkingPoints?.length ? <Sec n={4} title="Talking points"><Bullets items={brief.talkingPoints} /></Sec> : null}
      {brief.objections?.length ? (
        <Sec n={5} title="Anticipated objections & responses">
          <div className="overflow-hidden rounded-lg border border-[#E8E6E3]">
            <table className="w-full text-[13px]">
              <thead className="bg-[#F4F4F2] text-left text-[11px] uppercase tracking-wide text-[#9A948E]"><tr><th className="px-4 py-2.5 font-semibold">Objection</th><th className="px-4 font-semibold">Response</th></tr></thead>
              <tbody>{brief.objections.map((o, i) => (<tr key={i} className="border-t border-[#E8E6E3] align-top"><td className="px-4 py-3 font-medium text-[#0F0F0F]">{o.objection}</td><td className="px-4 py-3 text-[#6B6660]">{o.response}</td></tr>))}</tbody>
            </table>
          </div>
        </Sec>
      ) : null}
      {brief.comparableProjects?.length ? <Sec n={6} title="Comparable Riseup projects"><Bullets items={brief.comparableProjects} /></Sec> : null}
      {brief.sixtySecondPitch && <Sec n={7} title="Ready-made 60-second pitch"><div className="rounded-r-md border-l-[3px] border-[#EA5400] bg-[#F4F4F2] px-3.5 py-2.5 text-[13.5px] leading-[1.65] text-[#0F0F0F]">{brief.sixtySecondPitch}</div></Sec>}
      {brief.suggestedClose && <Sec n={8} title="Suggested close"><p className="font-medium text-[#0F0F0F]">{brief.suggestedClose}</p></Sec>}
    </div>
  );
}

export function PitchDeckView({ slides, onGenerate, generating }: { slides?: Slide[] | null; onGenerate: () => void; generating: boolean }) {
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  if (!slides || slides.length === 0) {
    return <GenEmpty testid="pitch-empty" icon={Presentation} title="No pitch deck yet"
      desc="Generate a presentation-ready deck from this proposal — cover, problem, solution, how-it-works, architecture, phases, proof, team, tech stack, objection-handling, pricing and a clear next step."
      cta="Generate slides" onGenerate={onGenerate} generating={generating} />;
  }
  return (
    <div data-testid="pitch-content">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-[#6B6660]">{slides.length} branded slides — aligned with the sales brief. Click any slide to present it.</span>
        <div className="flex items-center gap-2">
          <button data-testid="pitch-present" onClick={() => setViewIndex(0)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-[#141310] px-3 text-sm font-medium text-white hover:bg-[#000] disabled:opacity-50">
            <Play size={15} /> Present
          </button>
          <button data-testid="pitch-regenerate" disabled={generating} onClick={onGenerate}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-sm font-medium hover:bg-[#F4F4F2] disabled:opacity-50">
            {generating ? <><Loader2 size={15} className="animate-spin" /> Regenerating…</> : <><RefreshCw size={15} /> Regenerate deck</>}
          </button>
        </div>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {slides.map((s, i) => (
          <button key={i} data-testid={`pitch-slide-${i}`} onClick={() => setViewIndex(i)} aria-label={`Present slide ${i + 1}: ${s.title ?? ''}`}
            className="group relative block cursor-pointer overflow-hidden rounded-lg text-left ring-1 ring-[#E8E6E3] transition hover:ring-2 hover:ring-[#EA5400]">
            <SlideCard slide={s} index={i} total={slides.length} variant="thumb" />
            <span className="absolute bottom-2.5 right-2.5 hidden rounded bg-black/40 p-1 text-[#EDEAE6] group-hover:block"><Maximize2 size={14} /></span>
          </button>
        ))}
      </div>
      {viewIndex !== null && <SlideViewerModal slides={slides} initialIndex={viewIndex} onClose={() => setViewIndex(null)} />}
    </div>
  );
}
