import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  LogOut, Check, ArrowRight, ArrowLeft, UploadCloud, FileText, X,
  Sparkles, Globe, MapPin, Megaphone, Palette, CircleCheck, Loader2, Image as ImageIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createLeadFull, upsertRequirement, uploadBriefAttachment, uploadClientLogo, updateLead,
  fetchReadiness, generate,
} from '~/services/httpServices/leadDetailService';
import type { Readiness } from '~/services/httpServices/leadDetailService';
import { ReadinessPanel } from '~/components/ReadinessPanel';
import { TemplateType, ProjectType, Audience, PROJECT_TYPE_LABEL, AUDIENCE_LABEL } from '~/enums/lead.enum';
import { CURRENCIES, defaultCurrencyForTemplate } from '~/enums/currency.enum';
import { previewVendorQuote, commitVendorQuote } from '~/services/httpServices/budgetService';
import type { VendorQuotePreview } from '~/types/budget';
import { apiErrorMessage } from '~/services/httpMethods/interceptors';

import { useRoleBase } from '~/hooks/useRoleBase';

const STEPS = ['Client & Brand', 'Requirement', 'Template & Setup', 'Readiness', 'Review & Generate'];
const ACCEPT = '.pdf,.doc,.docx,.xlsx,.pptx,.txt,.md';
const MAX_BYTES = 25 * 1024 * 1024;
const LOGO_MAX = 2 * 1024 * 1024;

type Picked = { file: File; status: 'uploading' | 'parsed' | 'error' };
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const TEMPLATES: { key: TemplateType; name: string; icon: LucideIcon; desc: string; docs: string; combined: boolean }[] = [
  { key: TemplateType.GLOBAL, name: 'Global', icon: Globe, desc: 'Full enterprise proposal for international engagements.', docs: 'Proposal PDF + separate Excel budget', combined: false },
  { key: TemplateType.LOCAL, name: 'Local', icon: MapPin, desc: 'Domestic proposal tuned for local pricing and terms.', docs: 'Proposal PDF + separate Excel budget', combined: false },
  { key: TemplateType.AGENCY, name: 'Agency', icon: Megaphone, desc: 'Campaign & build proposal with budget folded in.', docs: 'Combined proposal + budget (one document)', combined: true },
  { key: TemplateType.DESIGN_PORTFOLIO, name: 'Design Portfolio', icon: Palette, desc: 'Visual-led showcase for branding & design work.', docs: 'Combined proposal + budget (one document)', combined: true },
];

const PROJECT_TYPES = Object.values(ProjectType);
const AUDIENCES = Object.values(Audience);

const GEN_STAGES = ['Retrieving similar Riseup projects', 'Deciding stack, structure & budget', 'Composing sections', 'Rendering diagrams'];
const SCORE_STAGES = ['Reading the brief & attachments', 'Comparing against past Riseup proposals', 'Scoring completeness', 'Pulling the unknowns that change the proposal'];

export default function NewLead() {
  const navigate = useNavigate();
  const { leadsPath, leadPath } = useRoleBase(); // keeps admins inside the admin shell
  const [step, setStep] = useState(1);
  const [leadId, setLeadId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [info, setInfo] = useState({ company: '', contactName: '', contactEmail: '', website: '', title: '' });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [brief, setBrief] = useState('');
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [template, setTemplate] = useState<TemplateType>(TemplateType.GLOBAL);
  const [projectType, setProjectType] = useState<ProjectType>(ProjectType.NEW_BUILD);
  const [audience, setAudience] = useState<Audience>(Audience.MIXED);
  const [projectContext, setProjectContext] = useState('');
  // Procurement (optional): hardware and/or a third-party service. Ticking either reveals the quotation
  // upload + an instruction box; the quotation is INTERNAL and never joins the client-facing brief.
  const [hardwareProject, setHardwareProject] = useState(false);
  const [thirdPartyService, setThirdPartyService] = useState(false);
  const [procurementNotes, setProcurementNotes] = useState('');
  const [quote, setQuote] = useState<VendorQuotePreview | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState('');
  const quoteInput = useRef<HTMLInputElement>(null);
  // Budget currency (Template & Setup step). Default follows the template (Local → BDT, else USD) until
  // the user manually chooses — after that we never stomp their choice on template change.
  const [currency, setCurrency] = useState<string>(defaultCurrencyForTemplate(TemplateType.GLOBAL));
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [genStage, setGenStage] = useState(0);
  const [genDone, setGenDone] = useState(false);
  const [scoreStage, setScoreStage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  // Keep the currency default in step with the chosen template — but only while the user hasn't overridden it.
  useEffect(() => {
    if (!currencyTouched) setCurrency(defaultCurrencyForTemplate(template));
  }, [template, currencyTouched]);

  // ---- Step 1: Client & Brand — create the lead (default template; set in step 3), then upload logo ----
  const pickLogo = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('Logo must be an image (PNG, JPG or SVG).'); return; }
    if (f.size > LOGO_MAX) { setErr('Logo exceeds 2 MB.'); return; }
    setErr('');
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const submitInfo = async () => {
    if (!info.company.trim()) { setErr('Client company is required.'); return; }
    setBusy(true); setErr('');
    try {
      const fields = {
        title: info.title.trim() || info.company.trim(),
        company: info.company.trim(),
        contactName: info.contactName || undefined,
        contactEmail: info.contactEmail || undefined,
        website: info.website || undefined,
      };
      let lid = leadId;
      if (lid) {
        // Re-entry (came Back to step 1): persist any edits instead of dropping them.
        await updateLead(lid, fields);
      } else {
        const lead = await createLeadFull({ ...fields, template, budgetCurrency: currency });
        lid = lead.id;
        setLeadId(lid);
      }
      if (logoFile) await uploadClientLogo(lid, logoFile).catch(() => undefined);
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

  // A lead cannot proceed without a brief: readiness, the proposal and the budget are all derived from it.
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

  // ---- Step 3: Template & Setup — persist template, currency, project context ----
  // Read the quotation on pick (writes nothing). It is only applied to the budget on Continue, so a rep
  // who attaches then unticks the box leaves no orphaned hardware on the lead.
  const onQuote = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setQuoteBusy(true); setQuoteMsg('');
    try {
      const p = await previewVendorQuote(leadId, { file: f });
      setQuote(p);
      setQuoteMsg(p.rows.length ? `Read ${p.rows.length} item(s) from ${f.name}.` : `Nothing priced found in ${f.name}.`);
    } catch (err) { setQuoteMsg(apiErrorMessage(err)); } finally { setQuoteBusy(false); }
  };

  const submitTemplate = async () => {
    setBusy(true); setErr('');
    try {
      await updateLead(leadId, {
        template,
        budgetCurrency: currency,
        projectType,
        audience,
        projectContext: projectContext.trim() || undefined,
        hardwareProject,
        thirdPartyService,
        procurementNotes: procurementNotes.trim() || undefined,
      });
      // Apply the reviewed hardware only when the box is still ticked.
      if (hardwareProject || thirdPartyService) {
        if (quote?.rows.length) {
          await commitVendorQuote(leadId, {
            rows: quote.rows, installWeeks: quote.installWeeks, warranty: quote.warranty, vatCents: quote.vatCents,
          }).catch(() => undefined);
        } else if (procurementNotes.trim()) {
          // No file — read the typed description the same way, then apply it.
          const p = await previewVendorQuote(leadId, { text: procurementNotes.trim() }).catch(() => null);
          if (p?.rows.length) {
            await commitVendorQuote(leadId, { rows: p.rows, installWeeks: p.installWeeks, warranty: p.warranty, vatCents: p.vatCents }).catch(() => undefined);
          }
        }
      }
      setStep(4);
    } catch (e) { setErr(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  // ---- Step 4: readiness (rubric adapts to the brief + project context saved in step 3) ----
  useEffect(() => {
    if (step !== 4 || !leadId) return;
    let alive = true;
    setReadiness(null); setScoreStage(0); setErr('');
    // Advance the scoring stages visually while the real request runs (stops short of the last stage
    // until the result lands, so the loader never "completes" before the data does).
    const timer = setInterval(() => setScoreStage((s) => (s < SCORE_STAGES.length - 1 ? s + 1 : s)), 800);
    fetchReadiness(leadId)
      .then((r) => { if (alive) { setScoreStage(SCORE_STAGES.length); setReadiness(r); } })
      .catch((e) => { if (alive) setErr(apiErrorMessage(e)); });
    return () => { alive = false; clearInterval(timer); };
  }, [step, leadId]);

  // ---- Step 5: generate (visual staged progress + real API call) ----
  useEffect(() => {
    if (step !== 5) return;
    let alive = true;
    let done: ReturnType<typeof setTimeout> | undefined;
    setGenStage(0); setGenDone(false); setErr('');
    const timer = setInterval(() => setGenStage((s) => (s < GEN_STAGES.length - 1 ? s + 1 : s)), 900);
    generate(leadId)
      .catch(() => undefined) // 503 without AI key — lead still exists; proceed to review
      .finally(() => { if (alive) { done = setTimeout(() => { setGenStage(GEN_STAGES.length); setGenDone(true); }, 900); } });
    return () => { alive = false; clearInterval(timer); if (done) clearTimeout(done); };
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

        {/* STEP 1 — CLIENT & BRAND */}
        {step === 1 && (
          <div>
            <h1 className="mb-1.5 text-[22px] font-semibold">Client &amp; brand</h1>
            <p className="mb-8 text-sm text-[#6B6660]">Tell us who this proposal is for. The logo appears on the proposal cover.</p>
            <div className="mb-5"><label className={labelCls}>Client company</label>
              <input data-testid="nl-company" className={inputCls} placeholder="e.g. ATEC Group" value={info.company} onChange={(e) => setInfo({ ...info, company: e.target.value })} /></div>

            {/* Brand logo */}
            <div className="mb-5">
              <label className={labelCls}>Client logo <span className="font-normal text-[#9A948E]">— optional</span></label>
              <div className="flex items-center gap-4">
                <div className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-lg border border-[#E8E6E3] bg-[#F9F8F7]">
                  {logoPreview ? <img src={logoPreview} alt="Client logo" className="max-h-full max-w-full object-contain" /> : <ImageIcon size={22} className="text-[#B9B4AE]" />}
                </div>
                <div className="flex flex-col gap-1.5">
                  <button type="button" data-testid="nl-logo-pick" onClick={() => logoInput.current?.click()} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2]">
                    <UploadCloud size={15} /> {logoFile ? 'Change logo' : 'Upload logo'}
                  </button>
                  {logoFile && (
                    <span className="flex items-center gap-2 text-xs text-[#9A948E]">{logoFile.name} · {fmtSize(logoFile.size)}
                      <button type="button" data-testid="nl-logo-remove" onClick={() => { setLogoFile(null); setLogoPreview(''); }} className="text-[#9A948E] hover:text-[#0F0F0F]"><X size={13} /></button>
                    </span>
                  )}
                  <span className="text-xs text-[#9A948E]">PNG, JPG or SVG — up to 2 MB.</span>
                </div>
                <input ref={logoInput} type="file" accept="image/*" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} className="hidden" data-testid="nl-logo-input" />
              </div>
            </div>

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
              <div className="mt-2 text-xs text-[#9A948E]">PDF · DOCX · XLSX · PPTX · TXT · MD — up to 25 MB each</div>
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
            <label className={labelCls}>Additional requirements <span className="font-normal normal-case text-[#9A948E]">— top priority; shapes the proposal (the uploaded document adds the detail)</span></label>
            <textarea data-testid="nl-brief" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Type the key requirements / priorities here. These take priority and shape the proposal; an uploaded document fills in the details…" className="min-h-[150px] w-full rounded-md border border-[#D4D1CC] p-3 text-sm outline-none focus:border-[#EA5400]" />
            {!hasRequirement && (
              <p data-testid="wizard-requirement-hint" className="mt-4 text-[13px] text-[#9A948E]">
                Upload a document or paste the requirement text to continue.
              </p>
            )}
            <Actions onBack={() => setStep(1)} onNext={submitRequirement} nextDisabled={!hasRequirement} />
          </div>
        )}

        {/* STEP 3 — TEMPLATE & SETUP */}
        {step === 3 && (
          <div>
            <h1 className="mb-1.5 text-[22px] font-semibold">Template &amp; setup</h1>
            <p className="mb-8 text-sm text-[#6B6660]">Choose the template and tell us how to frame the proposal. This shapes the sections and tone — the design stays consistent.</p>
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

            {/* Project context — framing + audience drive section framing/tone. */}
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="nl-project-type" className={labelCls}>Project framing</label>
                <select id="nl-project-type" data-testid="nl-project-type" value={projectType} onChange={(e) => setProjectType(e.target.value as ProjectType)} className={inputCls}>
                  {PROJECT_TYPES.map((p) => <option key={p} value={p}>{PROJECT_TYPE_LABEL[p]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="nl-audience" className={labelCls}>Audience</label>
                <select id="nl-audience" data-testid="nl-audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)} className={inputCls}>
                  {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5">
              <label htmlFor="nl-context" className={labelCls}>Project context <span className="font-normal text-[#9A948E]">— optional</span></label>
              <textarea id="nl-context" data-testid="nl-context" value={projectContext} onChange={(e) => setProjectContext(e.target.value)}
                placeholder="Anything that shapes the proposal but isn't in the brief — existing stack, constraints, deadline, competitive context…"
                className="min-h-[90px] w-full rounded-md border border-[#D4D1CC] p-3 text-sm outline-none focus:border-[#EA5400]" />
            </div>

            {/* Procurement — optional. Either box reveals the quotation upload + instruction note. */}
            <div className="mt-5 rounded-xl border border-[#E8E6E3] bg-[#FBFAF9] p-4">
              <div className="flex flex-wrap gap-x-8 gap-y-2.5">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" data-testid="nl-hardware-project" checked={hardwareProject}
                    onChange={(e) => setHardwareProject(e.target.checked)} className="h-4 w-4 accent-[#EA5400]" />
                  Hardware is part of this project
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" data-testid="nl-third-party" checked={thirdPartyService}
                    onChange={(e) => setThirdPartyService(e.target.checked)} className="h-4 w-4 accent-[#EA5400]" />
                  A third-party service is involved
                </label>
              </div>

              {(hardwareProject || thirdPartyService) && (
                <div className="mt-4 border-t border-[#E8E6E3] pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" data-testid="nl-quote-upload" disabled={quoteBusy}
                      onClick={() => quoteInput.current?.click()}
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[#D4D1CC] bg-white px-3 text-[13px] font-medium hover:bg-[#F4F4F2] disabled:opacity-60">
                      {quoteBusy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} Attach supplier quotation
                    </button>
                    <input ref={quoteInput} type="file" accept={ACCEPT} className="hidden" onChange={onQuote} />
                    {quoteMsg && <span className="text-xs text-[#6B6660]">{quoteMsg}</span>}
                  </div>

                  {quote && quote.rows.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-[#E8E6E3] bg-white">
                      <table className="w-full text-[13px]">
                        <tbody>
                          <tr className="bg-[#F9F8F7] text-[11px] uppercase tracking-wide text-[#9A948E]">
                            <th className="px-3 py-1.5 text-left">Item</th><th className="px-3 text-right">Qty</th><th className="px-3 text-right">Unit price</th><th className="px-2" />
                          </tr>
                          {quote.rows.map((r, i) => (
                            <tr key={i} className="border-t border-[#EFEDEA]">
                              <td className="px-3 py-1.5">{r.item}{r.brand ? <span className="text-[#9A948E]"> · {r.brand}</span> : null}</td>
                              <td className="px-3 text-right tabular-nums">{r.qty}</td>
                              <td className="px-3 text-right tabular-nums">{Math.round(Number(r.unitPriceCents) / 100).toLocaleString()}</td>
                              <td className="px-2 text-right">
                                <button type="button" title="Remove" onClick={() => setQuote({ ...quote, rows: quote.rows.filter((_, j) => j !== i) })} className="text-[#B42318] hover:underline"><X size={13} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#E8E6E3] bg-[#FBFAF9] px-3 py-2 text-xs text-[#6B6660]">
                        <span><b>{quote.rows.length}</b> item(s){quote.currency ? ` · ${quote.currency}` : ''}</span>
                        {quote.installWeeks ? <span>Install window <b>{quote.installWeeks} wk</b> — added to the schedule</span> : null}
                        {quote.warranty ? <span>Warranty captured</span> : null}
                      </div>
                      {quote.warnings.map((w, i) => <p key={i} className="px-3 py-1 text-xs text-[#B7791F]">{w}</p>)}
                    </div>
                  )}

                  <div className="mt-3">
                    <label htmlFor="nl-procurement" className={labelCls}>Instructions <span className="font-normal text-[#9A948E]">— optional</span></label>
                    <textarea id="nl-procurement" data-testid="nl-procurement" value={procurementNotes} onChange={(e) => setProcurementNotes(e.target.value)}
                      placeholder="No quotation to hand? Describe it — e.g. 4 face/RFID terminals, 2.5 lakh all-in, one week to install on both sites."
                      className="min-h-[70px] w-full rounded-md border border-[#D4D1CC] p-3 text-sm outline-none focus:border-[#EA5400]" />
                    <p className="mt-1.5 text-xs text-[#9A948E]">Internal only. The supplier is never named in the proposal — hardware is presented as supplied and installed by Riseup Labs.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Budget currency — default follows the template; the user may override it. */}
            <div className="mt-5 max-w-[420px]">
              <label htmlFor="wizard-currency" className={labelCls}>Budget currency</label>
              <select id="wizard-currency" data-testid="wizard-currency" value={currency}
                onChange={(e) => { setCurrency(e.target.value); setCurrencyTouched(true); }} className={inputCls}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-[#9A948E]">Rates come from the head-cost card. USD and BDT are used as-authored; other currencies convert from USD at the live rate.</p>
            </div>

            <Actions onBack={() => setStep(2)} onNext={submitTemplate} />
          </div>
        )}

        {/* STEP 4 — READINESS */}
        {step === 4 && (
          <div>
            <h1 className="mb-1.5 text-[22px] font-semibold">Requirement readiness</h1>
            <p className="mb-8 text-sm text-[#6B6660]">We scored how complete the brief is and pulled the specific unknowns that would change the proposal. Answer what you can, then generate.</p>
            {!readiness ? (
              <div className="rounded-xl border border-[#E8E6E3] bg-white p-6" data-testid="readiness-scoring">
                <div className="mb-5 h-1.5 w-full overflow-hidden rounded bg-[#F0EEEB]"><div className="h-full rounded bg-[#EA5400] transition-all" style={{ width: `${(scoreStage / SCORE_STAGES.length) * 100}%` }} /></div>
                <div className="flex flex-col gap-4">
                  {SCORE_STAGES.map((s, i) => (
                    <div key={s} className="flex items-center gap-3 text-[15px]">
                      {i < scoreStage ? <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0E7C5A] text-white"><Check size={14} /></span>
                        : i === scoreStage ? <Loader2 size={22} className="animate-spin text-[#EA5400]" />
                        : <span className="h-6 w-6 rounded-full border border-[#E8E6E3]" />}
                      <span className={i <= scoreStage ? 'font-medium text-[#0F0F0F]' : 'text-[#9A948E]'}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <ReadinessPanel leadId={leadId} readiness={readiness} onChange={setReadiness} />}
            {/* Don't let the user Generate before scoring returns. */}
            <Actions onBack={() => setStep(3)} onNext={() => setStep(5)} nextLabel="Generate" nextDisabled={!readiness} />
          </div>
        )}

        {/* STEP 5 — REVIEW & GENERATE */}
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

