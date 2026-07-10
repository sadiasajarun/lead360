import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  LogOut, Check, ArrowRight, ArrowLeft, UploadCloud, FileText, X, FlaskConical,
  Sparkles, Globe, MapPin, Megaphone, Palette, CircleCheck, Loader2, Copy, HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createLeadFull, upsertRequirement, uploadBriefAttachment, updateLead, fetchReadiness, resolveQuery, generate,
} from '~/services/httpServices/leadDetailService';
import type { ClientQuery, Readiness } from '~/services/httpServices/leadDetailService';
import { TemplateType } from '~/enums/lead.enum';
import { CURRENCIES, defaultCurrencyForTemplate } from '~/enums/currency.enum';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';
import { useRoleBase } from '~/hooks/useRoleBase';

const STEPS = ['Info', 'Requirement', 'Readiness', 'Template', 'Generate'];
const ACCEPT = '.pdf,.doc,.docx,.txt,.md';
const MAX_BYTES = 25 * 1024 * 1024;

type Picked = { file: File; status: 'uploading' | 'parsed' | 'error' };
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const TEMPLATES: { key: TemplateType; name: string; icon: LucideIcon; desc: string; docs: string; combined: boolean }[] = [
  { key: TemplateType.GLOBAL, name: 'Global', icon: Globe, desc: 'Full enterprise proposal for international engagements.', docs: 'Proposal PDF + separate Excel budget', combined: false },
  { key: TemplateType.LOCAL, name: 'Local', icon: MapPin, desc: 'Domestic proposal tuned for local pricing and terms.', docs: 'Proposal PDF + separate Excel budget', combined: false },
  { key: TemplateType.AGENCY, name: 'Agency', icon: Megaphone, desc: 'Campaign & build proposal with budget folded in.', docs: 'Combined proposal + budget (one document)', combined: true },
  { key: TemplateType.DESIGN_PORTFOLIO, name: 'Design Portfolio', icon: Palette, desc: 'Visual-led showcase for branding & design work.', docs: 'Combined proposal + budget (one document)', combined: true },
];

const GEN_STAGES = ['Retrieving similar Riseup projects', 'Drafting sections', 'Building budget', 'Rendering'];

export default function NewLead() {
  const navigate = useNavigate();
  const { leadsPath, leadPath } = useRoleBase(); // keeps admins inside the admin shell
  const [step, setStep] = useState(1);
  const [leadId, setLeadId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [info, setInfo] = useState({ company: '', contactName: '', contactEmail: '', website: '', title: '' });
  const [files, setFiles] = useState<Picked[]>([]);
  const [brief, setBrief] = useState('');
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [template, setTemplate] = useState<TemplateType>(TemplateType.GLOBAL);
  // Budget currency (step 4). Default follows the template (Local → BDT, else USD) until the user
  // manually chooses — after that we never stomp their choice on template change.
  const [currency, setCurrency] = useState<string>(defaultCurrencyForTemplate(TemplateType.GLOBAL));
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [genStage, setGenStage] = useState(0);
  const [genDone, setGenDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Keep the currency default in step with the chosen template — but only while the user hasn't
  // overridden it themselves.
  useEffect(() => {
    if (!currencyTouched) setCurrency(defaultCurrencyForTemplate(template));
  }, [template, currencyTouched]);

  // ---- Step 1: create the lead (default template; updated at step 4) ----
  const submitInfo = async () => {
    if (!info.company.trim()) { setErr('Client company is required.'); return; }
    setBusy(true); setErr('');
    try {
      const lead = await createLeadFull({
        title: info.title.trim() || info.company.trim(),
        company: info.company.trim(),
        contactName: info.contactName || undefined,
        contactEmail: info.contactEmail || undefined,
        website: info.website || undefined,
        template,
        budgetCurrency: currency,
      });
      setLeadId(lead.id);
      setStep(2);
    } catch (e) { setErr(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  // ---- Step 2: upload each file immediately (shows Parsed), paste text on continue ----
  const addFiles = async (picked: File[]) => {
    setErr('');
    const ok = picked.filter((f) => f.size <= MAX_BYTES);
    if (ok.length < picked.length) setErr('Some files exceed 25 MB and were skipped.');
    for (const file of ok) {
      const entry: Picked = { file, status: 'uploading' };
      setFiles((p) => [...p, entry]);
      try {
        const res = await uploadBriefAttachment(leadId, file);
        setFiles((p) => p.map((x) => (x.file === file ? { ...x, status: res.parsed ? 'parsed' : 'error' } : x)));
      } catch {
        setFiles((p) => p.map((x) => (x.file === file ? { ...x, status: 'error' } : x)));
      }
    }
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; };
  const onDrop = (e: DragEvent) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files ?? [])); };

  // A lead cannot proceed without a brief: readiness, the proposal and the budget are all derived
  // from it, so an empty requirement would generate a document about nothing.
  const hasRequirement = brief.trim().length > 0 || files.length > 0;

  const submitRequirement = async () => {
    if (!hasRequirement) {
      setErr('Add the requirement first — upload the brief/RFP or paste the requirement text.');
      return;
    }
    setBusy(true); setErr('');
    try {
      if (brief.trim()) await upsertRequirement(leadId, brief.trim());
      setStep(3);
    } catch (e) { setErr(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  // ---- Step 3: readiness ----
  useEffect(() => {
    if (step === 3 && leadId) {
      setReadiness(null);
      fetchReadiness(leadId).then(setReadiness).catch((e) => setErr(apiErrorMessage(e)));
    }
  }, [step, leadId]);

  // ---- Step 4: template ----
  const submitTemplate = async () => {
    setBusy(true); setErr('');
    try {
      await updateLead(leadId, { template, budgetCurrency: currency });
      setStep(5);
    } catch (e) { setErr(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  // ---- Step 5: generate (visual staged progress + real API call) ----
  useEffect(() => {
    if (step !== 5) return;
    let alive = true;
    setGenStage(0); setGenDone(false); setErr('');
    const timer = setInterval(() => setGenStage((s) => (s < GEN_STAGES.length - 1 ? s + 1 : s)), 700);
    generate(leadId)
      .catch(() => undefined) // 503 without AI key — lead still exists; proceed to review
      .finally(() => { if (alive) { setTimeout(() => { setGenStage(GEN_STAGES.length); setGenDone(true); }, 900); } });
    return () => { alive = false; clearInterval(timer); };
  }, [step, leadId]);

  // ---------- shared UI ----------
  const Stepper = () => (
    <div className="sticky top-[76px] z-[5] mb-7 flex items-center justify-between gap-3.5 rounded-[10px] border border-[#E8E6E3] bg-white px-5 py-3.5">
      <nav className="flex flex-wrap items-center">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? 'done' : n === step ? 'current' : 'todo';
          return (
            <div key={label} className="flex items-center">
              <div className="flex items-center gap-2.5">
                <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.5px] text-xs font-semibold ${
                  state === 'done' ? 'border-[#EA5400] bg-[#EA5400] text-white'
                  : state === 'current' ? 'border-[#EA5400] bg-white text-[#EA5400] shadow-[0_0_0_3px_rgba(234,84,0,0.08)]'
                  : 'border-[#D4D1CC] bg-white text-[#9A948E]'}`}>
                  {state === 'done' ? <Check size={14} /> : n}
                </span>
                <span className={`hidden whitespace-nowrap text-[13px] sm:block ${
                  state === 'current' ? 'font-semibold text-[#0F0F0F]' : state === 'done' ? 'font-medium text-[#6B6660]' : 'font-medium text-[#9A948E]'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <span className={`mx-2.5 h-[1.5px] w-9 ${n < step ? 'bg-[#EA5400]' : 'bg-[#D4D1CC]'}`} />}
            </div>
          );
        })}
      </nav>
      <button data-testid="wizard-save-exit" onClick={() => navigate(leadsPath)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2]">
        <LogOut size={15} /> Save &amp; exit
      </button>
    </div>
  );

  const inputCls = 'h-10 w-full rounded-md border border-[#D4D1CC] px-3 text-sm outline-none focus:border-[#EA5400] focus:shadow-[0_0_0_3px_rgba(234,84,0,0.08)]';
  const labelCls = 'mb-1.5 block text-[13px] font-semibold';
  const backBtn = 'inline-flex h-10 items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-4 text-sm font-medium hover:bg-[#F4F4F2]';
  const nextBtn = 'inline-flex h-10 items-center gap-1.5 rounded-md bg-[#EA5400] px-4 text-sm font-medium text-white hover:bg-[#CC4900] disabled:opacity-50';

  const Actions = ({ onBack, onNext, nextLabel = 'Continue', nextDisabled = false }: { onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean }) => (
    <div className="mt-9 flex max-w-[760px] items-center justify-between border-t border-[#E8E6E3] pt-6">
      {onBack ? <button onClick={onBack} className={backBtn}><ArrowLeft size={16} /> Back</button> : <button onClick={() => navigate(leadsPath)} className={backBtn}>Cancel</button>}
      <button data-testid="wizard-next" onClick={onNext} disabled={busy || nextDisabled} className={nextBtn}>{busy ? 'Working…' : nextLabel} <ArrowRight size={16} /></button>
    </div>
  );

  return (
    <div data-testid="new-lead-page">
      <Stepper />
      <div className="w-full max-w-[760px]">
        {err && <div data-testid="wizard-error" className="mb-4 rounded-md border border-[#F0D5D2] bg-[#FDF3F2] px-3 py-2 text-[13px] text-[#B42318]">{err}</div>}

        {/* STEP 1 — INFO */}
        {step === 1 && (
          <div>
            <h1 className="mb-1.5 text-[22px] font-semibold">Lead information</h1>
            <p className="mb-8 text-sm text-[#6B6660]">Tell us who this proposal is for. We use this to personalise the draft.</p>
            <div className="mb-5"><label className={labelCls}>Client company</label>
              <input data-testid="nl-company" className={inputCls} placeholder="e.g. ATEC Group" value={info.company} onChange={(e) => setInfo({ ...info, company: e.target.value })} /></div>
            <div className="mb-5 grid gap-5 sm:grid-cols-2">
              <div><label className={labelCls}>Contact name</label><input data-testid="nl-contact" className={inputCls} placeholder="e.g. Rehan Ahmed" value={info.contactName} onChange={(e) => setInfo({ ...info, contactName: e.target.value })} /></div>
              <div><label className={labelCls}>Contact email</label><input data-testid="nl-email" className={inputCls} placeholder="name@company.com" value={info.contactEmail} onChange={(e) => setInfo({ ...info, contactEmail: e.target.value })} /></div>
            </div>
            <div className="mb-5"><label className={labelCls}>Company website</label>
              <input data-testid="nl-website" className={inputCls} placeholder="https://company.com" value={info.website} onChange={(e) => setInfo({ ...info, website: e.target.value })} />
              <p className="mt-1.5 text-xs text-[#9A948E]">We may scan the site to enrich the client profile.</p></div>
            <div className="mb-5"><label className={labelCls}>Lead title <span className="font-normal text-[#9A948E]">— optional</span></label>
              <input data-testid="nl-title" className={inputCls} placeholder="e.g. AP Invoice Automation (SAP)" value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} />
              <p className="mt-1.5 text-xs text-[#9A948E]">Leave blank and we'll name it from the requirement.</p></div>
            <Actions onNext={submitInfo} />
          </div>
        )}

        {/* STEP 2 — REQUIREMENT */}
        {step === 2 && (
          <div>
            <h1 className="mb-1.5 text-[22px] font-semibold">Add the requirement</h1>
            <p className="mb-8 text-sm text-[#6B6660]">Upload the brief or RFP, or paste the requirement text. We'll read it to assess readiness.</p>
            <div data-testid="nl-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onClick={() => fileInput.current?.click()}
              className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-[#D4D1CC] bg-white px-6 py-10 text-center hover:border-[#EA5400]">
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-[#F4F4F2] text-[#6B6660]"><UploadCloud size={22} /></span>
              <div className="text-[15px] font-semibold">Drag &amp; drop files here</div>
              <div className="mt-0.5 text-[13px] text-[#6B6660]">or <span className="font-medium text-[#EA5400]">browse from your computer</span></div>
              <div className="mt-2 text-xs text-[#9A948E]">PDF · DOCX · TXT · MD — up to 25 MB each</div>
              <input ref={fileInput} type="file" accept={ACCEPT} multiple onChange={onPick} className="hidden" data-testid="nl-file-input" />
            </div>
            {files.length > 0 && (
              <div className="mt-3 flex flex-col gap-2" data-testid="nl-file-list">
                {files.map((f, i) => (
                  <div key={f.file.name + i} className="flex items-center gap-3 rounded-lg border border-[#E8E6E3] bg-white px-3.5 py-3">
                    <FileText size={18} className="shrink-0 text-[#EA5400]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{f.file.name}</div>
                      <div className="text-xs text-[#9A948E]">{fmtSize(f.file.size)} · {(f.file.name.split('.').pop() || '').toUpperCase()}</div>
                    </div>
                    {f.status === 'uploading' && <span className="flex items-center gap-1.5 text-[13px] text-[#9A948E]"><Loader2 size={15} className="animate-spin" /> Parsing…</span>}
                    {f.status === 'parsed' && <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#0E7C5A]"><CircleCheck size={15} /> Parsed</span>}
                    {f.status === 'error' && <span className="text-[13px] font-medium text-[#B42318]">Stored</span>}
                    <button onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="text-[#9A948E] hover:text-[#0F0F0F]" data-testid={`nl-file-remove-${i}`}><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]"><span className="h-px flex-1 bg-[#E8E6E3]" /> or paste text <span className="h-px flex-1 bg-[#E8E6E3]" /></div>
            <label className={labelCls}>Paste requirement text</label>
            <textarea data-testid="nl-brief" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Paste the client requirement, RFP text, or discovery notes here…" className="min-h-[150px] w-full rounded-md border border-[#D4D1CC] p-3 text-sm outline-none focus:border-[#EA5400]" />
            {!hasRequirement && (
              <p data-testid="wizard-requirement-hint" className="mt-4 text-[13px] text-[#9A948E]">
                Upload a document or paste the requirement text to continue.
              </p>
            )}
            <Actions onBack={() => setStep(1)} onNext={submitRequirement} nextDisabled={!hasRequirement} />
          </div>
        )}

        {/* STEP 3 — READINESS */}
        {step === 3 && (
          <div>
            <h1 className="mb-1.5 text-[22px] font-semibold">Requirement readiness</h1>
            <p className="mb-8 text-sm text-[#6B6660]">We scored how complete the brief is. Resolve the open queries to strengthen the proposal, or continue.</p>
            {!readiness ? <div className="text-sm text-[#6B6660]">Scoring…</div> : <ReadinessCard leadId={leadId} readiness={readiness} onChange={setReadiness} />}
            <Actions onBack={() => setStep(2)} onNext={() => setStep(4)} />
          </div>
        )}

        {/* STEP 4 — TEMPLATE */}
        {step === 4 && (
          <div>
            <h1 className="mb-1.5 text-[22px] font-semibold">Choose a template</h1>
            <p className="mb-8 text-sm text-[#6B6660]">This sets the proposal structure and which documents we produce. You can change it later.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {TEMPLATES.map((t) => {
                const on = template === t.key;
                const Icon = t.icon;
                return (
                  <button key={t.key} data-testid={`nl-template-${t.key}`} onClick={() => setTemplate(t.key)}
                    className={`flex flex-col rounded-xl border-2 bg-white p-4 text-left transition-colors ${on ? 'border-[#EA5400]' : 'border-[#E8E6E3] hover:border-[#D4D1CC]'}`}>
                    <div className="mb-4 flex h-[92px] flex-col justify-center gap-1.5 rounded-lg border border-[#E8E6E3] bg-[#F9F8F7] p-3">
                      <span className="h-1.5 w-3/4 rounded bg-[#E2DFDB]" /><span className="h-1.5 w-1/2 rounded bg-[#E2DFDB]" /><span className="mt-1 h-1.5 w-1/4 rounded bg-[#0E7C5A]" />
                    </div>
                    <div className="mb-1 flex items-center gap-1.5"><span className="text-[15px] font-semibold">{t.name}</span><Icon size={15} className="text-[#6B6660]" /></div>
                    <p className="flex-1 text-[13px] leading-[1.5] text-[#6B6660]">{t.desc}</p>
                    <div className="mt-3 flex items-center gap-1.5 border-t border-[#E8E6E3] pt-3 text-[13px] text-[#6B6660]"><FileText size={15} /> {t.docs}</div>
                  </button>
                );
              })}
            </div>

            {/* Budget currency — default follows the template; the user may override it. */}
            <div className="mt-6 max-w-[420px]">
              <label htmlFor="wizard-currency" className={labelCls}>Budget currency</label>
              <select
                id="wizard-currency"
                data-testid="wizard-currency"
                value={currency}
                onChange={(e) => { setCurrency(e.target.value); setCurrencyTouched(true); }}
                className={inputCls}
              >
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-[#9A948E]">Rates come from the head-cost card. USD and BDT are used as-authored; other currencies convert from USD at the live rate.</p>
            </div>

            <Actions onBack={() => setStep(3)} onNext={submitTemplate} />
          </div>
        )}

        {/* STEP 5 — GENERATE */}
        {step === 5 && (
          <div className="mx-auto max-w-[720px]">
            {!genDone ? (
              <div className="text-center">
                <span className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-xl bg-[#FCE9DE] text-[#EA5400]"><Sparkles size={24} /></span>
                <h1 className="text-[22px] font-semibold">Generating your proposal</h1>
                <p className="mt-1 text-sm text-[#6B6660]">This usually takes under a minute. You can leave — we'll keep working.</p>
                <div className="mt-6 rounded-xl border border-[#E8E6E3] bg-white p-6 text-left">
                  <div className="mb-5 h-1.5 w-full overflow-hidden rounded bg-[#F0EEEB]"><div className="h-full rounded bg-[#EA5400] transition-all" style={{ width: `${((genStage) / GEN_STAGES.length) * 100}%` }} /></div>
                  <div className="flex flex-col gap-4">
                    {GEN_STAGES.map((s, i) => (
                      <div key={s} className="flex items-center gap-3 text-[15px]">
                        {i < genStage ? <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0E7C5A] text-white"><Check size={14} /></span>
                          : i === genStage ? <Loader2 size={22} className="animate-spin text-[#EA5400]" />
                          : <span className="h-6 w-6 rounded-full border border-[#E8E6E3]" />}
                        <span className={i <= genStage ? 'font-medium text-[#0F0F0F]' : 'text-[#9A948E]'}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 border-t border-[#E8E6E3] pt-4 text-center text-[13px] text-[#9A948E]">{info.title || info.company} · {info.company} · {template.replace('_', ' ')} template</div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center" data-testid="wizard-done">
                <span className="mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-xl bg-[#DCF3EA] text-[#0E7C5A]"><CircleCheck size={26} /></span>
                <h1 className="text-[22px] font-semibold">Proposal ready</h1>
                <p className="mt-1 text-sm text-[#6B6660]">Your draft proposal and budget for {info.company} are ready to review.</p>
                <button data-testid="wizard-view-lead" onClick={() => navigate(leadPath(leadId))} className="mx-auto mt-6 inline-flex h-10 items-center gap-1.5 rounded-md bg-[#EA5400] px-5 text-sm font-medium text-white hover:bg-[#CC4900]"><ArrowRight size={16} /> View</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Readiness score + gauge + AI-generated client queries (data-driven from GET /leads/:id/readiness).
function ReadinessCard({ leadId, readiness, onChange }: { leadId: string; readiness: Readiness; onChange: (r: Readiness) => void }) {
  const { score, queries } = readiness;
  const ready = score >= 80;
  const confirmed = queries.filter((q) => q.status === 'confirmed').length;
  return (
    <div>
      <div className="rounded-xl border border-[#E8E6E3] bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-end gap-1"><span className="text-[40px] font-bold leading-none">{score}</span><span className="mb-1 text-sm text-[#9A948E]">/ 100</span></div>
            <span className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] font-medium ${ready ? 'border-[#BFE3D4] bg-[#ECF7F2] text-[#0E7C5A]' : 'border-[#F3E2C8] bg-[#FDF6EA] text-[#B7791F]'}`}><FlaskConical size={14} /> {ready ? 'Ready to generate' : 'Below threshold'}</span>
          </div>
          <div className="text-right"><div className="text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Readiness</div><div className="text-xs text-[#9A948E]">Recommended: 80+</div></div>
        </div>
        <div className="mt-5">
          <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-[#F2C4B8] via-[#F3E2C8] to-[#BFE3D4]">
            <div className="absolute top-[-3px] h-[14px] w-[2px] rounded bg-[#0F0F0F]" style={{ left: `${Math.min(100, Math.max(0, score))}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-medium"><span className="text-[#B42318]">AT RISK</span><span className="text-[#9A948E]">60</span><span className="text-[#B7791F]">FAIR</span><span className="text-[#0E7C5A]">READY</span></div>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9A948E]">Open client queries</span>
          <span className="text-xs text-[#9A948E]">{queries.length ? `${confirmed} of ${queries.length} resolved` : '0 open'}</span>
        </div>
        {queries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#D4D1CC] p-6 text-center text-sm text-[#6B6660]">No open queries — the brief looks complete enough to generate.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {queries.map((q) => <QueryRow key={q.id} leadId={leadId} query={q} onChange={onChange} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// A single clarifying question with Copy-to-send + Mark-confirmed (with an optional client answer).
function QueryRow({ leadId, query, onChange }: { leadId: string; query: ClientQuery; onChange: (r: Readiness) => void }) {
  const [answer, setAnswer] = useState(query.answer ?? '');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmed = query.status === 'confirmed';

  const copy = async () => {
    try { await navigator.clipboard.writeText(query.question); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  const resolve = async (status: 'open' | 'confirmed') => {
    setBusy(true);
    try { onChange(await resolveQuery(leadId, query.id, { status, answer: answer.trim() || undefined })); } finally { setBusy(false); }
  };

  return (
    <div data-testid={`query-${query.id}`} className={`rounded-lg border p-4 ${confirmed ? 'border-[#BFE3D4] bg-[#F4FBF8]' : 'border-[#E8E6E3] bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {confirmed
            ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-[#0E7C5A]" />
            : <HelpCircle size={18} className="mt-0.5 shrink-0 text-[#B7791F]" />}
          <div>
            <div className="text-[14px] font-semibold text-[#0F0F0F]">{query.question}</div>
            {query.why && <div className="mt-0.5 text-[13px] text-[#6B6660]">{query.why}</div>}
          </div>
        </div>
        <span className={`shrink-0 text-[12px] font-medium ${confirmed ? 'text-[#0E7C5A]' : 'text-[#9A948E]'}`}>{confirmed ? 'Confirmed' : 'Open'}</span>
      </div>
      <div className="mt-3">
        <input
          data-testid={`query-answer-${query.id}`}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Client answer (optional)…"
          className="h-9 w-full rounded-md border border-[#D4D1CC] px-3 text-[13px] outline-none focus:border-[#EA5400]"
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" data-testid={`query-copy-${query.id}`} onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-2.5 text-[13px] font-medium hover:bg-[#F4F4F2]">
          <Copy size={13} /> {copied ? 'Copied' : 'Copy to send'}
        </button>
        {confirmed ? (
          <button type="button" data-testid={`query-reopen-${query.id}`} disabled={busy} onClick={() => resolve('open')} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[#6B6660] hover:bg-[#F4F4F2] disabled:opacity-50">
            Reopen
          </button>
        ) : (
          <button type="button" data-testid={`query-confirm-${query.id}`} disabled={busy} onClick={() => resolve('confirmed')} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0E7C5A] px-2.5 text-[13px] font-medium text-white hover:bg-[#0B6448] disabled:opacity-50">
            <Check size={13} /> Mark confirmed
          </button>
        )}
      </div>
    </div>
  );
}
