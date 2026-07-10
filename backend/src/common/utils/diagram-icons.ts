// Icon + colour vocabulary for proposal diagrams (shared contract with the frontend's
// app/components/diagramIcons.ts — keep the two in sync).
//
// The generator is constrained to these icon names; anything unknown falls back to `check`.
// Paths are 24x24 stroke outlines (Lucide-style) so they render identically in Puppeteer's PDF
// and in the browser.

export const ICON_PATHS: Record<string, string> = {
  mobile: 'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M12 18h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  server: 'M3 4h18v6H3z M3 14h18v6H3z M7 7h.01 M7 17h.01',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3z M21 5v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5 M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
  wallet: 'M20 8H5a2 2 0 0 1 0-4h13v4 M4 6v12a2 2 0 0 0 2 2h14V8 M16 14h.01',
  chart: 'M3 3v18h18 M7 15l4-6 4 3 5-8',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  game: 'M6 12h4 M8 10v4 M15 13h.01 M18 11h.01 M2 12a6 6 0 0 1 6-6h8a6 6 0 0 1 0 12H8a6 6 0 0 1-6-6z',
  cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  card: 'M2 5h20v14H2z M2 10h20',
  check: 'M9 12l2 2 4-4 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  trophy: 'M6 4h12v6a6 6 0 0 1-12 0V4z M6 6H4a2 2 0 0 0 0 4h2 M18 6h2a2 2 0 0 1 0 4h-2 M9 20h6 M12 16v4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 7 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 2.6 15 1.65 1.65 0 0 0 1 13.09V13a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 2.6 7a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 7 2.6 1.65 1.65 0 0 0 9 1V.91a2 2 0 1 1 4 0V1a1.65 1.65 0 0 0 1.82 1.6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21.4 7c.36.14.66.4.86.73',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 15h6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  key: 'M21 2l-2 2 M15.5 7.5l3-3 2 2-3 3 M10 14a4 4 0 1 0-4 4 4 4 0 0 0 4-4z M10 14l5.5-5.5',
  api: 'M16 18l6-6-6-6 M8 6l-6 6 6 6',
  money: 'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  review: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z',
};

/** Node accent palette, cycled by index — mirrors the multi-colour look of Riseup's real figures. */
export const ACCENTS = [
  { fg: '#1D4ED8', bg: '#EFF6FF', bd: '#BFDBFE' }, // blue
  { fg: '#0E7C5A', bg: '#ECFDF3', bd: '#A7E8C8' }, // green
  { fg: '#EA5400', bg: '#FFF6ED', bd: '#FFD5B4' }, // orange (brand)
  { fg: '#6941C6', bg: '#F9F5FF', bd: '#D9CBF6' }, // purple
  { fg: '#0E7490', bg: '#ECFEFF', bd: '#A5E8F0' }, // teal
  { fg: '#B42318', bg: '#FEF3F2', bd: '#F5C4C0' }, // red
];

export const accentFor = (i: number) => ACCENTS[i % ACCENTS.length];

/** Inline SVG for a diagram node icon. Unknown names degrade to `check` rather than rendering blank. */
export function iconSvg(name: string | undefined, color: string, size = 18): string {
  const d = ICON_PATHS[(name ?? '').toLowerCase()] ?? ICON_PATHS.check;
  const paths = d.split(' M').map((seg, i) => (i === 0 ? seg : `M${seg}`));
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    paths.map((p) => `<path d="${p}"/>`).join('') +
    `</svg>`
  );
}
