/**
 * Self-contained icon set for the Solution Architecture diagram. Deliberately NOT the flaky server-resolved
 * iconMap (which fell back to a blank square) — these are hand-authored inline glyphs that always render, in
 * both the web view and (mirrored in the backend renderer) the PDF. Every glyph is drawn on a 24×24 viewBox
 * with stroke=currentColor, so the chip's colour flows through. Unknown names resolve to a neutral box.
 */

const GLYPH: Record<string, string> = {
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.5a3 3 0 0 1 0 5.5"/><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5"/>',
  server: '<rect x="3.5" y="4" width="17" height="6" rx="1.6"/><rect x="3.5" y="14" width="17" height="6" rx="1.6"/><circle cx="7" cy="7" r=".6" fill="currentColor"/><circle cx="7" cy="17" r=".6" fill="currentColor"/>',
  braces: '<path d="M9 4c-2 0-2 3-2 4s-1 1.8-2 1.8c1 0 2 .8 2 1.8s0 4 2 4"/><path d="M15 4c2 0 2 3 2 4s1 1.8 2 1.8c-1 0-2 .8-2 1.8s0 4-2 4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  gauge: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M12 15l3.5-3.5"/><circle cx="12" cy="15" r="1" fill="currentColor"/>',
  cart: '<path d="M4 5h2l2 10h9l2-7H7"/><circle cx="9" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  pin: '<path d="M12 21c4-4.5 6.5-7.6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 13.4 8 16.5 12 21Z"/><circle cx="12" cy="10.2" r="2.2"/>',
  bell: '<path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2H4.5Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  card: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17"/><path d="M7 15h3"/>',
  msg: '<path d="M4 5h16v10H9l-4 3.5V15H4Z"/><path d="M8 9h8M8 12h5"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>',
  bucket: '<path d="M5 7h14l-1.4 12.2a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8Z"/><ellipse cx="12" cy="7" rx="7" ry="2.4"/>',
  file: '<path d="M7 3h7l4 4v14H7Z"/><path d="M14 3v4h4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6Z"/><path d="M9 12l2 2 4-4"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16"/>',
  brain: '<path d="M9.5 4a2.8 2.8 0 0 0-2.8 2.8A2.8 2.8 0 0 0 5 12a2.4 2.4 0 0 0 1.8 4A2.4 2.4 0 0 0 11 17.4V6.4A2.4 2.4 0 0 0 9.5 4Z"/><path d="M14.5 4a2.8 2.8 0 0 1 2.8 2.8A2.8 2.8 0 0 1 19 12a2.4 2.4 0 0 1-1.8 4A2.4 2.4 0 0 1 13 17.4"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 3v2M14.5 3v2M9.5 19v2M14.5 19v2M3 9.5h2M3 14.5h2M19 9.5h2M19 14.5h2"/>',
  layers: '<path d="M12 4l8 4-8 4-8-4Z"/><path d="M4 12l8 4 8-4M4 16l8 4 8-4"/>',
  cloud: '<path d="M7.5 18a4 4 0 0 1 .4-8 5 5 0 0 1 9.5 1.1A3.5 3.5 0 0 1 17 18Z"/>',
  funnel: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5Z"/>',
  tag: '<path d="M12 3H5v7l9 9 7-7Z"/><circle cx="8.2" cy="8.2" r="1.2" fill="currentColor"/>',
  bolt: '<path d="M13 3 5.5 13H10l-1 8 8.5-11H13Z"/>',
  chart: '<path d="M4 4v16h16"/><rect x="7.5" y="12" width="2.6" height="5"/><rect x="12" y="8.5" width="2.6" height="8.5"/><rect x="16.5" y="5.5" width="2.6" height="11.5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z"/>',
  upload: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M4 14v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/>',
  box: '<rect x="5" y="5" width="14" height="14" rx="3"/>',
};

// Map whatever the diagram builder / model emits onto a real glyph — resilient to naming drift.
const ALIAS: Record<string, string> = {
  'server-cog': 'server', 'server-cog ': 'server', api: 'braces', 'api-server': 'braces', code: 'braces', rest: 'braces',
  web: 'globe', browser: 'globe', portal: 'globe', frontend: 'monitor', desktop: 'monitor', dashboard: 'monitor', app: 'monitor', smartphone: 'monitor', mobile: 'monitor', phone: 'monitor',
  'sliders-horizontal': 'gear', sliders: 'gear', controls: 'gear',
  security: 'shield', auth: 'lock', authentication: 'lock', key: 'lock',
  settings: 'gear', 'server-cog2': 'gear', orchestration: 'gear', cog: 'gear', processing: 'gear', engine: 'gear', matching: 'gear',
  rate: 'gauge', 'rate-limit': 'gauge', ratelimit: 'gauge', meter: 'gauge',
  booking: 'cart', checkout: 'cart', order: 'cart', shopping: 'cart', ecommerce: 'cart',
  catalog: 'list', 'list-checks': 'list', items: 'list', products: 'list',
  sources: 'file', 'cloud-upload': 'upload', 'file-up': 'upload', ingest: 'upload', import: 'upload',
  filter: 'funnel', collector: 'funnel', collection: 'funnel',
  label: 'tag', 'audit-trail': 'clock', versioned: 'file',
  zap: 'bolt', lightning: 'bolt', fast: 'bolt', 'fast-retrieval': 'bolt', retrieval: 'bolt', speed: 'bolt',
  'bar-chart': 'chart', analytics: 'chart', scalable: 'chart', graph: 'chart', metrics: 'chart',
  find: 'search', magnifier: 'search', query: 'search', 'vector-db': 'search',
  map: 'pin', 'map-pin': 'pin', location: 'pin', geo: 'pin', maps: 'pin', address: 'pin',
  notification: 'bell', notify: 'bell', alerts: 'bell', reminders: 'bell',
  'credit-card': 'card', payment: 'card', payments: 'card', wallet: 'card', billing: 'card', pay: 'card',
  message: 'msg', 'message-square': 'msg', whatsapp: 'msg', chat: 'msg', sms: 'msg', email: 'msg', mail: 'msg',
  database: 'db', postgres: 'db', postgresql: 'db', mysql: 'db', sql: 'db', 'relational-db': 'db',
  folder: 'bucket', 'file-storage': 'bucket', s3: 'bucket', storage: 'bucket', blob: 'bucket',
  document: 'file', doc: 'file', audit: 'file', logs: 'file', 'audit-logs': 'file', metadata: 'file',
  sessions: 'clock', time: 'clock', schedule: 'clock',
  user: 'users', people: 'users', customer: 'users', admin: 'users', account: 'users', accounts: 'users', hr: 'users',
  integration: 'plug', integrations: 'plug', service: 'plug', services: 'plug', 'api-service': 'plug', gateway: 'plug',
  ai: 'brain', ml: 'brain', llm: 'brain', model: 'brain', 'llm-provider': 'brain',
  compute: 'cpu', processor: 'cpu', embedding: 'layers', vector: 'layers', index: 'layers',
};

export function archGlyph(name?: string): string {
  const raw = (name ?? '').toLowerCase().trim();
  const key = ALIAS[raw] ?? raw;
  return GLYPH[key] ?? GLYPH.box;
}

export function ArchIcon({ name }: { name?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      // trusted: glyphs are hand-authored constants in this file
      dangerouslySetInnerHTML={{ __html: archGlyph(name) }}
    />
  );
}
