/**
 * Sample ProposalDocument — the SkyLink air-ticketing content from the locked
 * proposal-v2b, expressed as blocks[]. Used to verify the renderer end-to-end.
 */
import type { ProposalDocument } from '~/types/proposal';
import iconMapJson from './sample-icons.json';

export const sampleProposal: ProposalDocument = {
  meta: {
    client: { name: 'SkyLink Travels Ltd', logoUrl: null },
    preparedBy: 'Riseup Labs',
    contact: { email: 'contact@riseuplabs.com', phone: '+88-0175-974-7387', website: 'riseuplabs.com', address: 'Gulshan, Dhaka' },
    template: 'agency',
    projectType: 'new_build',
    audience: 'business',
    currency: 'BDT',
    date: 'August 2026',
  },
  iconMap: iconMapJson as Record<string, string>,
  blocks: [
    {
      id: 'cover', type: 'cover',
      kicker: 'Technical & Financial Proposal · August 2026',
      projectName: 'SkyLink Air Ticketing Platform',
      oneLiner: 'Flights, holidays and visas on one platform — GDS plus direct local airline inventory, secure payments, and a self-service customer portal.',
    },
    {
      id: 'overview', type: 'overview',
      eyebrow: 'The Solution',
      heading: 'A single platform that books seats, sells holidays, and processes visas — run entirely by your team',
      lead: 'A production-ready B2C platform for the Bangladesh market with three connected verticals — GDS + direct local airline APIs, payments via SSLCommerz, SMS confirmation, and a single ops console.',
      stats: [
        { icon: 'globe', n: '3', label: 'Verticals', sub: 'Flights · Holidays · Visas' },
        { icon: 'plug', n: '6', label: 'Integrations', sub: 'GDS · local · pay · SMS' },
        { icon: 'layout-dashboard', n: '1', label: 'Unified App', sub: 'Web + portal' },
        { icon: 'clock', n: '14', label: 'Weeks', sub: 'Discovery → launch' },
      ],
    },
    {
      id: 'scope', type: 'scope',
      heading: "What we'll build",
      modules: [
        { icon: 'plane', title: 'Flights', points: ['Multi-city search', 'GDS + local fares', 'Seat, baggage, instant e-ticket'] },
        { icon: 'umbrella', title: 'Holidays', points: ['Curated & custom packages', 'Inquiry-to-quote', 'Itinerary + voucher PDF'] },
        { icon: 'file', title: 'Visas', points: ['Requirements engine', 'Document upload', 'Status timeline'] },
      ],
      experience: [
        { title: 'One search, every option', detail: 'The platform fans out to GDS and local airlines at once and shows the best fares as each source replies.' },
        { title: 'A price with nothing hidden', detail: 'Base fare, taxes and service fee shown separately before payment.' },
        { title: 'Pay the way they already pay', detail: 'Card, bKash/Nagad, or bank — confirmed instantly by SMS with the ticket number.' },
        { title: 'Everything in one account', detail: 'Flights, holidays and visas together in the portal, Bangla or English.' },
      ],
      outOfScope: ['GDS / IATA consolidator fees & PCC setup', 'Third-party subscription & usage costs (SMS, gateway)', 'Brand identity & UI design creation', 'Content writing & translation'],
    },
    {
      id: 'arch', type: 'layeredArchitecture', eyebrow: 'Solution architecture', heading: 'How the platform is wired together',
      layers: [
        { label: 'Channels', tone: 'blue', modules: [{ icon: 'globe', label: 'Website' }, { icon: 'smartphone', label: 'Mobile PWA' }] },
        { label: 'Application Core', tone: 'core', modules: [{ icon: 'search', label: 'Search Engine' }, { icon: 'plane', label: 'Booking Engine' }] },
        { label: 'Integrations', tone: 'grey', modules: [{ icon: 'server', label: 'GDS' }, { icon: 'wallet', label: 'SSLCommerz' }] },
      ],
    },
    {
      id: 'journey', type: 'numberedFlow', eyebrow: 'User journey', heading: 'Full booking flow',
      steps: [
        { icon: 'search', title: 'Search', sub: 'Route, dates & pax' },
        { icon: 'plane', title: 'Select Flight', sub: 'GDS + local fares' },
        { icon: 'ticket', title: 'E-Ticket', sub: 'PNR + invoice, SMS' },
      ],
      rulesBar: { icon: 'shield', title: 'Validation & rules', items: ['Fare rules shown', 'Payment verified server-side'] },
    },
    {
      id: 'infra', type: 'vendorArchitecture', eyebrow: 'Deployment', heading: 'Infrastructure architecture',
      tiers: [{ badge: 1, icon: 'react', title: 'Frontend', sub: 'Next.js SPA' }],
      group: { label: 'Single Linux VM (Ubuntu)', services: [
        { icon: 'nginx', title: 'Nginx', sub: 'Reverse Proxy' },
        { icon: 'fastapi', title: 'API', sub: 'App Service' },
        { icon: 'redis', title: 'Redis', sub: 'Cache / Queue' },
      ] },
      data: [{ icon: 'postgresql', title: 'PostgreSQL', sub: 'Managed Database' }],
    },
    {
      id: 'seq', type: 'diagram', kind: 'sequence', engine: 'mermaid', eyebrow: 'Interaction', heading: 'Booking sequence',
      spec: 'sequenceDiagram\n  User->>Platform: Search\n  Platform-->>User: Fares',
    },
    {
      id: 'features', type: 'featureMatrix', heading: 'Features by module — and who uses them',
      users: [{ code: 'C', label: 'Customer' }, { code: 'A', label: 'Travel Agent / Ops' }, { code: 'M', label: 'Admin' }],
      modules: [
        { icon: 'plane', name: 'Flights', features: [
          { title: 'Multi-city / return search', sub: 'GDS + local inventory', users: ['C', 'A'] },
          { title: 'Hold, re-issue & void desk', sub: 'Carrier permitting', users: ['A', 'M'] },
        ] },
        { icon: 'file', name: 'Visas', features: [
          { title: 'Country requirement engine', sub: 'Editable rule sheets', users: ['C', 'A', 'M'] },
        ] },
      ],
    },
    {
      id: 'approach', type: 'workApproach', heading: 'Three phases, each accepted before the next begins', unitKind: 'phase',
      units: [
        { name: 'Phase 1 · Foundation & Flights', timeline: 'Weeks 1–6', deliverables: ['GDS abstraction layer', 'Flight search + fare aggregation', 'Booking engine — PNR, hold, issue', 'Payment integration', 'Instant e-ticket + SMS'], acceptance: 'Book a live domestic + international itinerary end-to-end; payment verified; e-ticket delivered.' },
        { name: 'Phase 2 · Holidays & Visas', timeline: 'Weeks 7–10', deliverables: ['Holiday package CMS', 'Inquiry-to-quote workflow', 'Visa requirement engine', 'Document upload + status timeline'], acceptance: 'Publish a package & convert an inquiry; submit a visa application and track it to a decision.' },
        { name: 'Phase 3 · Admin & Launch', timeline: 'Weeks 11–14', deliverables: ['Admin console + CRM', 'Finance & reconciliation', 'Full QA + payment-flow testing', 'Production deploy + training'], acceptance: 'Full regression pass; reconciliation matches settlement file; production sign-off.' },
      ],
      methodology: 'We work in Agile two-week sprints with a demo and retro at the end of each. Every feature carries a Definition of Done — code reviewed, merged, deployed to staging — and the backlog is re-prioritised with you each sprint so scope stays aligned with value.',
      qaApproach: 'Each release passes functional, regression and integration testing on a staging mirror of production before sign-off; payment and booking flows get dedicated end-to-end scenarios. A release is gated on a green regression run and zero open P0/P1 defects.',
    },
    {
      id: 'deliverables', type: 'deliverables', eyebrow: 'Scope commitment', heading: 'Deliverables & acceptance criteria',
      items: [
        { deliverable: 'GDS abstraction layer', acceptance: 'Live fare + availability returned from ≥2 providers within 3s p95.', phase: 'Phase 1' },
        { deliverable: 'Booking engine (PNR, hold, issue)', acceptance: 'A domestic and an international itinerary book end-to-end with a valid PNR.', phase: 'Phase 1' },
        { deliverable: 'Payment integration', acceptance: 'Successful capture + refund verified against the gateway settlement file.', phase: 'Phase 1' },
        { deliverable: 'Holiday package CMS', acceptance: 'A package is authored, published and booked by a test customer.', phase: 'Phase 2' },
        { deliverable: 'Visa requirement engine', acceptance: 'A visa application is submitted and tracked to a decision state.', phase: 'Phase 2' },
        { deliverable: 'Admin console + reconciliation', acceptance: 'Daily reconciliation matches the settlement file with zero unexplained variance.', phase: 'Phase 3' },
      ],
    },
    {
      id: 'stack', type: 'techStack', heading: 'What we chose, and why',
      rows: [
        { layer: 'Frontend', choice: 'Next.js + Tailwind', why: 'SEO-friendly rendering, fast search results, mobile-first.' },
        { layer: 'Backend', choice: 'NestJS', why: 'Tight integration code for GDS/API orchestration.' },
        { layer: 'Data', choice: 'PostgreSQL + Redis', why: 'Transactional integrity; Redis caches fares to cut GDS segment fees.', value: 'Lower running cost' },
      ],
    },
    {
      id: 'team', type: 'teamAllocation', heading: 'Who delivers this, and what they own',
      members: [
        { icon: 'user', role: 'Project Manager', units: 1, responsibility: 'Single point of contact, weekly status, risk log.' },
        { icon: 'settings', role: 'Solution Architect', units: 1, responsibility: 'GDS layer, integration design, code reviews.' },
        { icon: 'server', role: 'Backend Engineers', units: 2, responsibility: 'Booking engine, payments, admin APIs.' },
        { icon: 'check', role: 'QA Engineer', units: 1, responsibility: 'Functional, regression, payment-flow testing.' },
      ],
    },
    {
      id: 'timeline', type: 'timeline', eyebrow: 'Delivery timeline', heading: 'Project timeline — week by week', totalWeeks: 14,
      rows: [
        { label: 'Phase 1 · Foundation & Flights', startWeek: 1, endWeek: 6, deliverable: 'GDS layer, booking engine, payments' },
        { label: 'Phase 2 · Holidays & Visas', startWeek: 7, endWeek: 10, deliverable: 'Package CMS, visa engine' },
        { label: 'Phase 3 · Admin & Launch', startWeek: 11, endWeek: 14, deliverable: 'Admin, QA, production deploy' },
      ],
    },
    {
      id: 'assumptions', type: 'assumptions', eyebrow: 'Ground rules', heading: 'Assumptions & dependencies',
      assumptions: [
        'Scope is as described in this proposal; material changes follow the change-control process.',
        'One consolidated round of feedback is provided per deliverable within 3 business days.',
        'A single production environment is targeted for launch.',
      ],
      dependencies: [
        'SkyLink provides GDS/consolidator credentials and a payment-gateway merchant account before Phase 1.',
        'Branding, copy and legal/visa content are supplied by SkyLink before the relevant phase.',
        'Third-party licence and certification fees are paid directly by SkyLink.',
      ],
    },
    {
      id: 'financial', type: 'financial', heading: 'Investment — phase by phase', currency: 'BDT',
      rows: [
        { label: 'Phase 1', focus: 'Foundation & Flights', timeline: 'Weeks 1–6', amountCents: 34000000 },
        { label: 'Phase 2', focus: 'Holidays & Visas', timeline: 'Weeks 7–10', amountCents: 26000000 },
        { label: 'Phase 3', focus: 'Admin, hardening & launch', timeline: 'Weeks 11–14', amountCents: 20000000 },
      ],
      totalCents: 80000000,
      note: 'Total (excl. GDS/API & certification costs)',
      explanation: { rationale: 'Comparable Riseup platform builds of this size landed at BDT 7–9 lakh — this sits mid-band.', byStack: 'Backend 40% · Frontend 30% · Integrations 20% · QA/PM 10%.' },
    },
    {
      id: 'payment', type: 'paymentTerms', heading: 'A simple four-stage schedule',
      terms: [{ percent: 30, label: 'On signing' }, { percent: 30, label: 'Phase 1 acceptance' }, { percent: 30, label: 'Phase 2 acceptance' }, { percent: 10, label: 'On go-live' }],
      note: 'Change requests billed at BDT 12,000 / man-day. Third-party fees paid directly by SkyLink.',
    },
    {
      id: 'handover', type: 'handover', heading: 'What you receive from us',
      columns: [
        ['Production platform — Flights, Holidays, Visas', 'Customer portal with full self-service', 'Admin console with reports & roles', 'GDS abstraction + local airline integrations'],
        ['Source code + Git repository ownership', 'Technical documentation & API references', 'Admin training (2 sessions) + recordings', '60 days of post-launch defect-fix support'],
      ],
    },
    {
      id: 'comparables', type: 'comparables', heading: "We've built booking and transactional platforms before",
      items: [
        { name: 'eCook', blurb: 'Multi-vendor ordering with payments & live tracking.', url: 'https://riseuplabs.com/portfolio/' },
        { name: 'WorkTok', blurb: 'Two-sided marketplace, wallet, and admin console.', url: 'https://riseuplabs.com/portfolio/' },
        { name: 'U-Report', blurb: 'High-volume transactional messaging at national scale.', url: 'https://riseuplabs.com/portfolio/' },
      ],
      whyRiseup: {
        heading: 'Why build this with Riseup Labs',
        body: "We've shipped 200+ products across booking, fintech and marketplace domains — so we've already solved the hard parts your platform depends on. You own the source code, your team is trained to run it, and we stay on after launch.",
        points: [{ stat: '200+', label: 'products delivered' }, { stat: '15+ yrs', label: 'in market' }, { stat: 'You own it', label: 'full source + handover' }],
      },
    },
    {
      id: 'next', type: 'nextStep', heading: 'Getting started',
      steps: [
        { title: 'Proposal sign-off', sub: 'Confirm scope & commercial terms.' },
        { title: 'Kickoff workshop', sub: 'Stakeholders, supplier accounts, go-live target.' },
        { title: 'Discovery sprint', sub: 'UX research, GDS confirmation, sitemap.' },
        { title: 'Build starts', sub: 'Week-by-week status, milestone reviews.' },
      ],
    },
  ],
};
