/**
 * Lead360 — end-to-end API sweep.
 *
 * Exercises the lead status machine, RBAC, cross-rep isolation, budget currency, the money guard
 * rails and the analytics contract against a RUNNING backend. It creates leads and deletes them
 * again on the way out. It never triggers AI generation, so it costs nothing to run.
 *
 * Prerequisites: the backend is up, and `npm run seed` has been run at least once.
 *
 *   npm run test:api-sweep
 *   BASE_URL=https://staging.example.com/api npm run test:api-sweep
 *
 * Credentials come from .claude-project/user_stories/_fixtures.yaml — the single source of truth
 * shared with the seed script. Never hardcode them here.
 *
 * Exit code 0 = every check passed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const API = process.env.BASE_URL ?? 'http://localhost:3000/api';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', '.claude-project', 'user_stories', '_fixtures.yaml');

const fixtures = yaml.load(readFileSync(FIXTURES, 'utf8'));
const cred = (key) => {
  const u = fixtures.users.find((x) => x.key === key);
  if (!u) throw new Error(`_fixtures.yaml has no user with key "${key}"`);
  return u;
};
const ADMIN = cred('admin');
const SALES = cred('sales');
const SALES2 = cred('sales2');

let pass = 0, fail = 0;
const failures = [];
const created = [];

function ok(cond, label, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; failures.push(`${label} ${detail}`); console.log(`  FAIL  ${label}  ${detail}`); }
}

class Session {
  constructor(name) { this.name = name; this.cookies = new Map(); }
  jar() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  absorb(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  async req(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: { 'content-type': 'application/json', cookie: this.jar() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.absorb(res);
    let data = null;
    const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    return { status: res.status, data, ct: res.headers.get('content-type') || '' };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b); }
  patch(p, b) { return this.req('PATCH', p, b); }
  del(p) { return this.req('DELETE', p); }
  async login(email, password) {
    const r = await this.post('/auth/login', { email, password });
    if (r.status !== 200 && r.status !== 201) throw new Error(`${this.name} login failed ${r.status} ${JSON.stringify(r.data)}`);
    const me = await this.get('/auth/me');
    this.id = me.data?.data?.id ?? me.data?.id;
    this.role = me.data?.data?.role ?? me.data?.role;
    return this;
  }
}

const unwrap = (d) => (d && typeof d === 'object' && 'data' in d ? d.data : d);
const statusOf = (r) => unwrap(r.data)?.status;

async function mkLead(s, over = {}) {
  const r = await s.post('/leads', {
    title: `SWEEP ${Math.random().toString(36).slice(2, 8)}`,
    company: 'Sweep Co',
    template: 'agency',
    ...over,
  });
  const lead = unwrap(r.data);
  if (r.status !== 201) throw new Error(`create failed ${r.status} ${JSON.stringify(r.data)}`);
  created.push(lead.id);
  return lead;
}

const H = (t) => console.log(`\n=== ${t} ===`);

(async () => {
  // ── A. AUTH ────────────────────────────────────────────────────────────────
  H('A. Auth');
  const admin = await new Session('admin').login(ADMIN.email, ADMIN.password);
  const sales = await new Session('sales').login(SALES.email, SALES.password);
  const sales2 = await new Session('sales2').login(SALES2.email, SALES2.password);
  ok(admin.role === 'admin', 'admin logs in with role=admin', admin.role);
  ok(sales.role === 'sales_pm', 'sales logs in with role=sales_pm', sales.role);
  // Both a short and a long wrong password must fail identically — no length oracle.
  const badShort = await new Session('b1').req('POST', '/auth/login', { email: ADMIN.email, password: 'wrong' });
  const badLong = await new Session('b2').req('POST', '/auth/login', { email: ADMIN.email, password: 'wrongwrongwrong' });
  ok(badShort.status === 401, 'short wrong password -> 401', `got ${badShort.status}`);
  ok(badLong.status === 401, 'long wrong password -> 401', `got ${badLong.status}`);
  ok(badShort.status === badLong.status, 'wrong-password response does not vary with length');
  const noUser = await new Session('b3').req('POST', '/auth/login', { email: 'nobody-here@riseuplabs.com', password: 'wrongwrongwrong' });
  ok(noUser.status === 401, 'unknown email -> 401 (no user enumeration)', `got ${noUser.status}`);
  const anon = await new Session('anon').get('/leads');
  ok(anon.status === 401, 'unauthenticated /leads -> 401', `got ${anon.status}`);

  // ── B. SALES HAPPY PATH + REJECTION LOOP ──────────────────────────────────
  H('B. Sales lifecycle: generated -> pending -> rejected -> pending -> approved -> sent -> locked');
  const L = await mkLead(sales);
  ok(L.status === 'generated', 'new lead is generated', L.status);

  let r = await sales.post(`/leads/${L.id}/submit`);
  ok(statusOf(r) === 'pending_approval', 'sales submit -> pending_approval', `${r.status} ${statusOf(r)}`);

  r = await sales.post(`/leads/${L.id}/submit`);
  ok(r.status === 400, 'resubmit while pending -> 400', `got ${r.status}`);

  r = await admin.post(`/leads/${L.id}/submit`);
  ok(r.status === 400, 'ADMIN submit on a rep lead -> 400 (no self-approve)', `got ${r.status}`);

  r = await admin.post(`/approvals/${L.id}/reject`, {});
  ok(r.status === 400, 'admin reject WITHOUT note -> 400', `got ${r.status}`);

  r = await admin.post(`/approvals/${L.id}/reject`, { note: 'needs a tighter timeline' });
  ok([200, 201].includes(r.status) && statusOf(r) === 'rejected', 'admin reject (with note) -> rejected', `${r.status} ${statusOf(r)}`);

  r = await sales.post(`/leads/${L.id}/mark-sent`);
  ok(r.status === 400, 'mark-sent from rejected -> 400', `got ${r.status}`);

  r = await sales.post(`/leads/${L.id}/submit`);
  ok(statusOf(r) === 'pending_approval', 'sales RESUBMITS from rejected -> pending_approval', `${r.status} ${statusOf(r)}`);

  r = await admin.post(`/approvals/${L.id}/approve`, {});
  ok([200, 201].includes(r.status) && statusOf(r) === 'approved', 'admin approve (note optional) -> approved', `${r.status} ${statusOf(r)}`);

  r = await sales.post(`/leads/${L.id}/mark-sent`);
  ok(statusOf(r) === 'sent', 'sales mark-sent from approved -> sent', `${r.status} ${statusOf(r)}`);

  r = await sales.post(`/leads/${L.id}/mark-locked`);
  ok(statusOf(r) === 'locked', 'mark-locked from sent -> locked', `${r.status} ${statusOf(r)}`);

  r = await sales.post(`/leads/${L.id}/mark-lost`, { reason: 'budget' });
  ok(r.status === 400, 'mark-lost on a locked lead -> 400', `got ${r.status}`);

  // ── C. ADMIN OWN LEAD SKIPS APPROVAL ──────────────────────────────────────
  H('C. Admin own lead: generated -> sent (no approval step)');
  const A = await mkLead(admin);
  r = await admin.post(`/leads/${A.id}/submit`);
  ok(r.status === 400, 'admin submit on OWN lead -> 400', `got ${r.status}`);
  ok(/do not need approval/i.test(JSON.stringify(r.data)), 'the 400 explains why', JSON.stringify(r.data).slice(0, 90));

  r = await admin.post(`/leads/${A.id}/mark-sent`);
  ok(statusOf(r) === 'sent', 'admin mark-sent on own generated lead -> sent', `${r.status} ${statusOf(r)}`);
  const afterA = unwrap((await admin.get(`/leads/${A.id}`)).data);
  ok(afterA.submittedAt == null, 'admin-sent lead keeps submittedAt = null', String(afterA.submittedAt));

  // ── D. ADMIN CANNOT SHORT-CIRCUIT A REP'S DRAFT ───────────────────────────
  H("D. Admin cannot mark-sent another rep's draft");
  const D = await mkLead(sales);
  r = await admin.post(`/leads/${D.id}/mark-sent`);
  ok(r.status === 400, "admin mark-sent on rep's generated draft -> 400", `got ${r.status}`);

  // ── E. CROSS-REP ISOLATION ────────────────────────────────────────────────
  H('E. Isolation');
  r = await sales2.get(`/leads/${D.id}`);
  ok(r.status === 403, "sales2 GET another rep's lead -> 403", `got ${r.status}`);
  const s2list = unwrap((await sales2.get('/leads?limit=100')).data);
  const s2items = s2list?.items ?? s2list ?? [];
  ok(!s2items.some((x) => x.id === D.id), "sales2 list excludes another rep's lead");

  const adminList = unwrap((await admin.get('/leads?limit=100')).data);
  const aItems = adminList?.items ?? adminList ?? [];
  ok(!aItems.some((x) => x.id === D.id), "admin list excludes a rep's UNSUBMITTED draft");
  ok(aItems.some((x) => x.id === L.id), 'admin list includes a lead that entered the pipeline');
  ok(aItems.some((x) => x.id === A.id), 'admin list includes their own lead');

  // ── F. REJECTED LEAD STAYS VISIBLE TO ADMIN ───────────────────────────────
  H('F. Rejected visibility + queue');
  const R2 = await mkLead(sales);
  await sales.post(`/leads/${R2.id}/submit`);
  const queue = unwrap((await admin.get('/approvals')).data);
  const qItems = queue?.items ?? queue ?? [];
  ok(qItems.some((x) => x.id === R2.id), 'pending lead appears in the approvals queue');
  await admin.post(`/approvals/${R2.id}/reject`, { note: 'scope unclear' });
  const queue2 = unwrap((await admin.get('/approvals')).data);
  const q2 = queue2?.items ?? queue2 ?? [];
  ok(!q2.some((x) => x.id === R2.id), 'rejected lead LEAVES the approvals queue');
  ok((await admin.get(`/leads/${R2.id}`)).status === 200, 'admin can still open the lead they rejected');
  const cmts = unwrap((await sales.get(`/leads/${R2.id}/comments`)).data) ?? [];
  ok(cmts.some((c) => c.decision === 'rejected' && /scope unclear/.test(c.body ?? '')),
     'rejection note lands in the comment thread as a decision');

  // ── G. CURRENCY ───────────────────────────────────────────────────────────
  H('G. Budget currency');
  const cLocal = await mkLead(sales, { template: 'local' });
  ok(cLocal.budgetCurrency === 'BDT', 'local template defaults to BDT', cLocal.budgetCurrency);
  const cAgency = await mkLead(sales, { template: 'agency' });
  ok(cAgency.budgetCurrency === 'USD', 'agency template defaults to USD', cAgency.budgetCurrency);
  const cEur = await mkLead(sales, { template: 'global', budgetCurrency: 'EUR' });
  ok(cEur.budgetCurrency === 'EUR', 'explicit EUR honoured', cEur.budgetCurrency);
  const cBad = await sales.post('/leads', { title: 'x', company: 'y', template: 'global', budgetCurrency: 'XXX' });
  ok(cBad.status === 400, 'unsupported currency -> 400', `got ${cBad.status}`);
  const cLocalUsd = await mkLead(sales, { template: 'local', budgetCurrency: 'USD' });
  ok(cLocalUsd.budgetCurrency === 'USD', 'local + explicit USD overrides the BDT default', cLocalUsd.budgetCurrency);

  // ── H. BUDGET VIEW CONVERSION ─────────────────────────────────────────────
  H('H. Budget conversion (display-only)');
  const bad2 = await sales.get(`/leads/${L.id}/budget?currency=XXX`);
  ok(bad2.status === 400, 'budget ?currency=XXX -> 400', `got ${bad2.status}`);
  const bNat = await sales.get(`/leads/${L.id}/budget`);
  if (bNat.status === 200) {
    const b = unwrap(bNat.data);
    ok(b.converted === false, 'no ?currency -> converted:false');
    const bEur = unwrap((await sales.get(`/leads/${L.id}/budget?currency=EUR`)).data);
    ok(bEur.converted === true && bEur.viewCurrency === 'EUR', 'view in EUR -> converted:true', JSON.stringify(bEur?.viewCurrency));
    ok(typeof bEur.rate === 'number' && bEur.rate > 0, 'conversion exposes the rate used', String(bEur?.rate));
  } else {
    console.log(`  SKIP  budget conversion (lead has no budget yet: ${bNat.status})`);
  }

  // ── I. MARK LOST ──────────────────────────────────────────────────────────
  H('I. Mark lost');
  const Lo = await mkLead(admin);
  await admin.post(`/leads/${Lo.id}/mark-sent`);
  r = await admin.post(`/leads/${Lo.id}/mark-lost`, { reason: 'not_a_reason' });
  ok(r.status === 400, 'invalid loss reason -> 400', `got ${r.status}`);
  r = await admin.post(`/leads/${Lo.id}/mark-lost`, {});
  ok(r.status === 400, 'missing loss reason -> 400', `got ${r.status}`);
  r = await admin.post(`/leads/${Lo.id}/mark-lost`, { reason: 'competitor', note: 'went with vendor X' });
  ok(statusOf(r) === 'lost', 'valid loss reason -> lost', `${r.status} ${statusOf(r)}`);
  const lost = unwrap((await admin.get(`/leads/${Lo.id}`)).data);
  ok(lost.lossReason === 'competitor' && /vendor X/.test(lost.lossNote ?? ''), 'loss reason + note persisted');

  // ── J. RBAC ON SETTINGS ───────────────────────────────────────────────────
  H('J. Settings RBAC + public logo');
  ok((await sales.req('PUT', '/settings/branding', { companyName: 'Hax' })).status === 403, 'sales PUT /settings/branding -> 403');
  ok((await sales.post('/settings/currency/sync')).status === 403, 'sales POST currency/sync -> 403');
  ok((await sales.get('/settings')).status === 200, 'sales CAN read /settings');
  const logoRes = await fetch(`${API}/settings/branding/logo`);
  ok([200, 404].includes(logoRes.status), 'branding logo is public (200 or 404)', `got ${logoRes.status}`);

  // ── K. EMPTY-BRIEF GUARD ──────────────────────────────────────────────────
  H('K. Empty-brief guard');
  const G = await mkLead(sales);
  r = await sales.post(`/leads/${G.id}/generate`, { sourceText: '   ' });
  ok(r.status === 400, 'generate with blank brief -> 400 (no AI spend)', `got ${r.status}`);
  r = await admin.post(`/leads/${(await mkLead(admin)).id}/generate`, {});
  ok(r.status === 400, 'admin generate with no brief -> 400', `got ${r.status}`);

  // ── L. ANALYTICS SHAPE ────────────────────────────────────────────────────
  H('L. Analytics');
  const ov = unwrap((await admin.get('/analytics/overview')).data);
  ok(Array.isArray(ov?.funnel) && ov.funnel.length === 5, 'funnel has 5 stages', String(ov?.funnel?.length));
  ok(ov?.rejected && typeof ov.rejected.count === 'number', 'analytics exposes rejected side-branch', JSON.stringify(ov?.rejected));
  ok(ov?.lost && typeof ov.lost.count === 'number', 'analytics exposes lost side-branch');
  ok(!ov.funnel.some((f) => f.status === 'rejected'), 'rejected is NOT a funnel bar');

  // ── M. RATE CARD ──────────────────────────────────────────────────────────
  H('M. Rate card currency');
  // Role names on the head-cost sheet embed seniority ("Mid Back-end Web Developer").
  const ROLE = encodeURIComponent('Mid Back-end Web Developer');
  const rc = {};
  for (const cur of ['USD', 'BDT', 'EUR', 'INR']) {
    const s = await admin.get(`/rate-cards/suggest?role=${ROLE}&seniority=mid&currency=${cur}`);
    rc[cur] = unwrap(s.data)?.dayRateCents ?? null;
  }
  ok(Object.values(rc).every((v) => v != null), 'a real rate-card role resolves in every currency', JSON.stringify(rc));
  ok(new Set(Object.values(rc)).size === 4, 'each currency yields a distinct rate', JSON.stringify(rc));

  // §10: an unknown role must be SKIPPED, never priced from thin air.
  const ghost = await admin.get('/rate-cards/suggest?role=Chief%20Vibes%20Officer&seniority=mid&currency=USD');
  ok(unwrap(ghost.data)?.dayRateCents === null, 'unknown role -> dayRateCents:null (never invented)', JSON.stringify(unwrap(ghost.data)));

  // ── cleanup ───────────────────────────────────────────────────────────────
  H('Cleanup');
  let removed = 0;
  for (const id of created) { const d = await admin.del(`/leads/${id}`); if ([200, 204].includes(d.status)) removed++; }
  console.log(`  deleted ${removed}/${created.length} sweep leads`);

  console.log(`\n${'─'.repeat(64)}\n  PASS ${pass}   FAIL ${fail}\n${'─'.repeat(64)}`);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  ✗ ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nSWEEP CRASHED:', e.message); process.exit(2); });
