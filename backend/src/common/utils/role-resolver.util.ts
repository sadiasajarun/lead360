import { Seniority } from '../enums';

/**
 * Role-name resolution against the rate card.
 *
 * Role names arrive from three places that do NOT agree with each other: the rate card
 * ("Sr.Quality Assurance (QA) Engineer"), stored project cases ("QA Engineer"), and the model's own
 * phase teams ("iOS Tech Lead"). The card is the only one that carries money, so anything that cannot
 * be mapped onto it prices at zero - which is how a proposal came to tell a client that 100% of an iOS
 * build's budget went to project management.
 *
 * Resolution is: strip the seniority prefix, expand abbreviations, then score token overlap against the
 * card's own families. Nothing here is hard-coded to the current card contents - families are read from
 * whatever rows exist, so adding a role to the card makes it resolvable with no code change.
 */

/** Seniority written into role names on the rate card ("Sr. iOS Developer", "Mid Animator"). */
const SENIORITY_PREFIX: { re: RegExp; seniority: Seniority }[] = [
  { re: /^(sr\.?|senior)\s*/i, seniority: Seniority.SENIOR },
  { re: /^(mid|intermediate)\s*/i, seniority: Seniority.MID },
  { re: /^(jr\.?|junior)\s*/i, seniority: Seniority.JUNIOR },
];

/**
 * Token synonyms. Left side is what the other sources say, right side is the vocabulary the rate card
 * uses. Multi-word patterns are listed before single tokens so "quality assurance" wins over "quality".
 */
const SYNONYMS: [RegExp, string][] = [
  [/\bqa\b|\bquality assurance\b|\btester\b|\btest engineer\b|\bsqa\b/g, 'quality assurance qa'],
  [/\bpm\b|\bproject manager\b|\bproduct manager\b|\bproduct owner\b|\bba\b|\bbusiness analyst\b|\bdelivery manager\b|\bscrum master\b/g, 'product project manager'],
  [/\btech lead\b|\btechnical lead\b|\bteam lead\b|\bengineering lead\b|\blead engineer\b/g, 'technical lead'],
  [/\bdevops\b|\bdev ops\b|\bsre\b|\bsite reliability\b|\binfrastructure\b|\brelease engineer\b|\bcloud engineer\b/g, 'dev ops'],
  [/\bback[- ]?end\b|\bbackend\b|\bapi developer\b|\bserver developer\b/g, 'back-end web'],
  [/\bfront[- ]?end\b|\bfrontend\b|\bweb developer\b|\breact developer\b|\bvue developer\b/g, 'front-end web'],
  [/\bui\/ux\b|\bux\/ui\b|\bui ux\b|\bux designer\b|\bui designer\b|\bproduct designer\b/g, 'ui ux'],
  [/\bios\b|\bswift\b|\biphone\b/g, 'ios'],
  [/\bandroid\b|\bflutter\b|\bkotlin\b|\bcross[- ]?platform\b|\breact native\b/g, 'android flutter'],
  [/\bunity\b|\bgameplay\b/g, 'game'],
  [/\bsolution architect\b|\bsystem architect\b|\bsoftware architect\b|\bsystech\b/g, 'systech architect'],
  [/\bsysadmin\b|\bsystem administrator\b|\bserver admin\w*\b/g, 'server administrator'],
  [/\bdotnet\b|\bc#\b|\bjava developer\b/g, 'dotnet java'],
  [/\bgraphic designer\b|\bvisual designer\b/g, 'graphics designer'],
];

/** Words that carry no discriminating signal - every second role is an "engineer" or a "developer". */
const STOPWORDS = new Set(['the', 'a', 'and', 'of', 'for', 'engineer', 'developer', 'specialist', 'expert', 'consultant']);

/** "Design - Sr. UI/UX Designer" -> "Sr. UI/UX Designer" (case rows can carry a department prefix). */
const stripDepartment = (raw: string): string => {
  const dot = raw.lastIndexOf('·');
  return (dot >= 0 ? raw.slice(dot + 1) : raw).trim();
};

/** Split a role name into its seniority (when the name encodes one) and its bare family text. */
export function splitSeniority(raw: string): { seniority?: Seniority; family: string } {
  const name = stripDepartment(raw);
  for (const { re, seniority } of SENIORITY_PREFIX) {
    if (re.test(name)) return { seniority, family: name.replace(re, '').trim() };
  }
  return { family: name };
}

/**
 * Comparable token set: lowercased, punctuation and filler words removed.
 *
 * `expand` applies the synonym table and is for the INCOMING name only - never for the card. Rewriting
 * card rows collapses genuinely different roles into one family ("Tester" and "Quality Assurance (QA)
 * Engineer" both become the same token set, and one silently overwrites the other). The card is the
 * authority; queries are translated into its vocabulary, not the other way round.
 */
function tokens(raw: string, expand = false): Set<string> {
  let s = ' ' + raw.toLowerCase().replace(/[^a-z0-9/.#+ -]/g, ' ') + ' ';
  if (expand) for (const [re, canonical] of SYNONYMS) s = s.replace(re, ' ' + canonical + ' ');
  return new Set(
    s
      .replace(/[/.-]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * Overlap biased to the shorter name, so "QA Engineer" still matches the card's longer official title.
 *
 * Containment alone ties too often - "QA Engineer" is fully contained by BOTH "Quality Assurance (QA)
 * Engineer" and "QA Lead". The Jaccard term breaks those ties toward the family with the fewest extra
 * tokens (the plain QA engineer, not the lead), and is small enough never to outrank a better containment.
 */
function score(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const containment = shared / Math.min(a.size, b.size);
  const jaccard = shared / Math.max(a.size, b.size);
  return containment + jaccard * 0.01;
}

export interface CardRole {
  role: string;
  seniority: Seniority;
}

/** A role family present on the rate card, with whichever seniority tiers actually exist for it. */
export interface RoleFamily {
  /** Normalised family key, e.g. "ios". */
  key: string;
  tiers: Partial<Record<Seniority, string>>;
}

/**
 * Group the rate card into families keyed on the bare role name, so "Sr. iOS Developer" and
 * "Mid iOS Developer" become one family with two tiers. This is what makes a seniority downgrade
 * possible with no new data model - the ladder is already encoded in the card's own role names.
 */
export function buildRoleFamilies(card: CardRole[]): RoleFamily[] {
  const byKey = new Map<string, RoleFamily>();
  for (const row of card) {
    const { seniority, family } = splitSeniority(row.role);
    const key = [...tokens(family)].sort().join(' ');
    if (!key) continue;
    const entry = byKey.get(key) ?? { key, tiers: {} };
    entry.tiers[seniority ?? row.seniority] = row.role;
    byKey.set(key, entry);
  }
  return [...byKey.values()];
}

/** Seniority order, cheapest first - the direction a downgrade walks. */
export const SENIORITY_ORDER: Seniority[] = [Seniority.JUNIOR, Seniority.MID, Seniority.SENIOR];

/**
 * Resolve any role name onto the rate card.
 *
 * `wanted` is the seniority the plan asked for; when that tier does not exist for the family, the
 * nearest available tier is returned instead (with `exact: false`) rather than the role being dropped.
 * Returns null only when nothing on the card is recognisably the same role - callers MUST surface that
 * rather than pricing the line at zero.
 */
export function resolveRoleName(
  raw: string,
  card: CardRole[],
  wanted?: Seniority,
  minScore = 0.5,
): { role: string; seniority: Seniority; exact: boolean } | null {
  const { seniority: named, family } = splitSeniority(raw);
  const target = tokens(family, true);
  const families = buildRoleFamilies(card);

  let best: { fam: RoleFamily; s: number } | null = null;
  for (const fam of families) {
    const s = score(target, new Set(fam.key.split(' ')));
    if (s > (best?.s ?? 0)) best = { fam, s };
  }
  if (!best || best.s < minScore) return null; // score() adds a <=0.01 tie-break term; threshold is on containment

  const ask = wanted ?? named ?? Seniority.MID;
  const exactTier = best.fam.tiers[ask];
  if (exactTier) return { role: exactTier, seniority: ask, exact: true };

  // Nearest tier, preferring to step DOWN (cheaper) so a missing senior tier never inflates a quote.
  const askIdx = SENIORITY_ORDER.indexOf(ask);
  const nearest = [...SENIORITY_ORDER].sort((x, y) => {
    const dx = Math.abs(SENIORITY_ORDER.indexOf(x) - askIdx);
    const dy = Math.abs(SENIORITY_ORDER.indexOf(y) - askIdx);
    return dx - dy || SENIORITY_ORDER.indexOf(x) - SENIORITY_ORDER.indexOf(y);
  });
  for (const s of nearest) {
    const tier = best.fam.tiers[s];
    if (tier) return { role: tier, seniority: s, exact: false };
  }
  return null;
}

/**
 * The cheaper tiers available for a role, cheapest first - the downgrade ladder for the budget solver.
 * Empty when the card carries this role at a single tier (true for PM, Technical Lead and DevOps today),
 * which is exactly the signal that the seniority lever cannot be applied to that line.
 */
export function downgradesFor(raw: string, card: CardRole[], from?: Seniority): { role: string; seniority: Seniority }[] {
  const resolved = resolveRoleName(raw, card, from);
  if (!resolved) return [];
  const { family } = splitSeniority(resolved.role);
  const key = [...tokens(family)].sort().join(' ');
  const fam = buildRoleFamilies(card).find((f) => f.key === key);
  if (!fam) return [];
  const current = SENIORITY_ORDER.indexOf(resolved.seniority);
  const out: { role: string; seniority: Seniority }[] = [];
  for (const s of SENIORITY_ORDER.slice(0, Math.max(0, current))) {
    const tier = fam.tiers[s];
    if (tier) out.push({ role: tier, seniority: s });
  }
  return out;
}
