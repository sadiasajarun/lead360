/**
 * Synthetic ProposalDocument covering every block type NOT exercised by proposal-sample.ts
 * (fictional "Northwind Clinic" content — no client data). Used by the renderer golden tests so any
 * change to a block's rendered output is caught.
 */
import type { ProposalDocument, TemplateCategory } from '../../src/modules/generation/blocks/block.types';

const st = (icon: string, title: string, desc: string, footer: string) => ({ icon, title, desc, footer });

export function extendedProposal(template: TemplateCategory, currency: 'USD' | 'BDT'): ProposalDocument {
  return {
    meta: {
      client: { name: 'Northwind Clinic', logoUrl: null },
      projectTitle: 'Patient Booking Platform',
      preparedBy: 'Riseup Labs',
      contact: { email: 'contact@riseuplabs.com', phone: '+88-0175-974-7387', website: 'riseuplabs.com' },
      template,
      projectType: 'new_build',
      audience: 'mixed',
      currency,
      date: 'October 2026',
    },
    iconMap: {},
    blocks: [
      { id: 'c1', type: 'cover', kicker: 'Technical Proposal · October 2026', projectName: 'Patient Booking Platform', oneLiner: 'Online appointments, reminders and clinic scheduling in one place' },
      { id: 'o1', type: 'overview', eyebrow: 'The Solution', heading: 'Booking without the phone queue', lead: 'Patients book, reschedule and get reminders online; staff manage calendars from one dashboard.', stats: [] },
      { id: 's1', type: 'scope', eyebrow: 'Scope', heading: 'What we will build', modules: [
        { icon: 'calendar', title: 'Booking', points: ['Doctor availability', 'Slot booking and rescheduling'] },
        { icon: 'bell', title: 'Reminders', points: ['SMS and email reminders'] },
        { icon: 'layout-dashboard', title: 'Admin', points: ['Calendars', 'Reports'] },
      ], experience: [{ title: 'Book in a minute', detail: 'Pick a doctor, pick a slot, done.' }], outOfScope: ['Payments', 'Telemedicine'] },
      { id: 'sa1', type: 'solutionArchitecture', eyebrow: 'Solution Architecture', heading: 'Simple, layered and secure', groups: [
        { key: 'u', label: 'Users', icon: 'users', tone: 'grey', span: true, nodes: [{ icon: 'monitor', title: 'Patient web app' }, { icon: 'monitor', title: 'Staff dashboard' }] },
        { key: 'a', label: 'Application', icon: 'server', tone: 'core', span: true, nodes: [{ icon: 'braces', title: 'Booking API' }, { icon: 'bell', title: 'Notification service' }] },
        { key: 'd', label: 'Data', icon: 'db', tone: 'data', span: true, nodes: [{ icon: 'db', title: 'PostgreSQL' }], footnote: 'Hosted in a managed cloud environment.' },
      ], edges: [] },
      { id: 'pf1', type: 'processFlow', eyebrow: 'System Flow', flows: [
        { heading: 'Booking flow', stages: [st('users', 'Patient', 'Opens the app', 'start'), st('clock', 'Pick slot', 'Live availability', 'choose'), st('db', 'Confirm', 'Saved and reminded', 'done')], arrows: [{ kind: 'data' }, { kind: 'processing' }],
          outputLabel: 'also records', outputs: [{ icon: 'bell', title: 'Reminder', desc: 'SMS 24 h before' }] },
      ] },
      { id: 'nf1', type: 'numberedFlow', eyebrow: 'User Journey', heading: 'From search to visit', steps: [{ icon: 'search', title: 'Find a doctor', sub: 'By specialty' }, { icon: 'calendar', title: 'Book', sub: 'Pick a slot' }, { icon: 'bell', title: 'Reminder', sub: 'Day before' }],
        rulesBar: { icon: 'shield', title: 'Always', items: ['Consent recorded', 'Data encrypted'] } },
      { id: 'fm1', type: 'featureMatrix', eyebrow: 'Requirements', heading: 'Features by module', users: [], modules: [
        { icon: 'calendar', name: 'Booking', features: [{ title: 'Availability', sub: 'Per doctor', users: [] }, { title: 'Rescheduling', sub: 'Self-service', users: [] }] },
      ] },
      { id: 'w1', type: 'workApproach', heading: 'Three phases', unitKind: 'phase', methodology: 'Weekly demos.', qaApproach: 'Functional and device testing.', units: [
        { name: 'Phase 1 — Discovery', timeline: '2 wks', acceptance: '', deliverables: ['Requirements', 'Design'] },
        { name: 'Phase 2 — Build', timeline: '4 wks', acceptance: '', deliverables: ['Booking', 'Reminders'] },
        { name: 'Phase 3 — Launch', timeline: '2 wks', acceptance: '', deliverables: ['QA', 'Release'] },
      ] },
      { id: 't1', type: 'timeline', eyebrow: 'Delivery Timeline', heading: '8 weeks', totalWeeks: 8, layout: 'table', rows: [
        { label: 'Phase 1 — Discovery', startWeek: 1, endWeek: 2 }, { label: 'Phase 2 — Build', startWeek: 3, endWeek: 6 }, { label: 'Phase 3 — Launch', startWeek: 7, endWeek: 8 },
      ] },
      { id: 't2', type: 'timeline', eyebrow: 'Delivery Timeline', heading: 'Gantt', totalWeeks: 8, layout: 'gantt', rows: [
        { label: 'Phase 1', startWeek: 1, endWeek: 2, deliverable: 'Design' }, { label: 'Phase 2', startWeek: 3, endWeek: 6 }, { label: 'Phase 3', startWeek: 7, endWeek: 8 },
      ] },
      { id: 'ta1', type: 'teamAllocation', eyebrow: 'Team Allocation', heading: 'Who delivers this', members: [{ icon: 'user', role: 'Project Manager', units: 1, responsibility: 'Plan and delivery.' }, { icon: 'code', role: 'Developer', units: 2, responsibility: 'Build.' }] },
      { id: 'f1', type: 'financial', heading: 'Financial estimation', currency, columns: ['Phase', 'Focus', 'Timeline', `Investment (${currency})`], totalCents: 900000,
        rows: [{ label: 'Phase 1', focus: 'Discovery', timeline: 'Weeks 1–2', amountCents: 200000 }, { label: 'Phase 2', focus: 'Build', timeline: 'Weeks 3–6', amountCents: 500000 }, { label: 'Phase 3', focus: 'Launch', timeline: 'Weeks 7–8', amountCents: 200000 }], note: 'Total' },
      { id: 'f2', type: 'financial', eyebrow: 'Rate Card', heading: 'Support rates', currency, columns: ['Item', 'Detail', 'Rate'], hideTotal: true, totalCents: 0, note: 'Billed monthly.',
        rows: [{ label: 'Support', amountCents: 0, cells: ['Support', 'Business hours', '500'] }, { label: 'Hosting', amountCents: 0, cells: ['Hosting', 'Managed cloud', '120'] }] },
      { id: 'eq1', type: 'equipment', eyebrow: 'Hardware', heading: 'Equipment', currency, showPricing: true, totalCents: 50000, warranty: '1 year', rows: [{ item: 'Kiosk tablet', uom: 'pc', qty: 2, unitPriceCents: 25000, amountCents: 50000 }] },
      { id: 'ct1', type: 'commercialTerms', eyebrow: 'Commercial Terms', heading: 'Terms', note: 'Valid 60 days.', terms: [{ label: 'Pricing', detail: 'Fixed per phase', basis: 'Fixed' }, { label: 'Support', detail: '3 months included', basis: 'Included' }] },
      { id: 'pt1', type: 'paymentTerms', heading: 'Payment schedule', terms: [{ percent: 40, label: 'On signing' }, { percent: 60, label: 'Go-live' }], note: 'Net 15.' },
      { id: 'as1', type: 'assumptions', eyebrow: 'Ground Rules', heading: 'Assumptions & remarks', assumptions: ['Content supplied by the clinic.'], dependencies: ['Timely feedback.'] },
      { id: 'oos1', type: 'outOfScope', eyebrow: 'Boundaries', heading: 'Out of scope', items: ['Payments', 'Telemedicine'], note: 'Change control applies.' },
      { id: 'pr1', type: 'prose', eyebrow: 'Notes', heading: 'A note on data', paragraphs: ['Patient data stays in the clinic’s own cloud account.'] },
      { id: 'so1', type: 'signoff', eyebrow: 'Acceptance', heading: 'Sign-off', criteria: ['Booking works end to end.'], parties: [{ role: 'Northwind Clinic' }, { role: 'Riseup Labs', name: 'Project Manager' }] },
      { id: 'h1', type: 'handover', heading: 'What you receive', columns: [['Source code', 'Deployment'], ['Documentation', 'Training']] },
      { id: 'cmp1', type: 'comparables', heading: 'Comparable work', items: [{ name: 'Example project', blurb: 'A booking app.', url: 'https://riseuplabs.com/portfolio/' }],
        whyRiseup: { heading: 'Why Riseup Labs', body: 'One team for design, build and support.', points: [] } },
      { id: 'ns1', type: 'nextStep', heading: 'Next step', steps: [{ title: 'Kickoff', sub: 'Confirm scope' }, { title: 'Design', sub: 'Week 1' }] },
    ],
  } as unknown as ProposalDocument;
}
