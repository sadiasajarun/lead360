/**
 * Calendar-day boundaries in a fixed business timezone.
 *
 * Dashboard buckets ("today", "yesterday") must follow the team's working day, not the host clock.
 * A UTC host would roll the day over at 6am Dhaka time and file a whole morning of usage under
 * "yesterday", so the boundary is pinned to APP_TIMEZONE (IANA name) instead. Offsets come from
 * Intl, so there is no extra dependency and zones that observe DST stay correct.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Dhaka';

/** Offset (ms) of `timeZone` from UTC at the instant `at` — positive east of Greenwich. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const p: Record<string, number> = {};
  for (const part of parts) if (part.type !== 'literal') p[part.type] = Number(part.value);
  // hour comes back as 24 at midnight under hour12:false in some ICU builds — normalise to 0.
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Working WEEKS between `todayISO` and a stated deadline date (constraint-driven planning). Counts business
 * days (Mon–Fri, weekends excluded) from the day AFTER today up to and including the deadline, then divides
 * by 5 and rounds (min 1). Returns undefined when either date is unparseable or the deadline is in the past.
 * Riseup plans in 5-day working weeks, so "2 Sept from 23 Aug" ≈ 7 business days ≈ 1–2 weeks.
 */
export function weeksUntilDeadline(deadlineISO?: string | null, todayISO?: string | null): number | undefined {
  if (!deadlineISO) return undefined;
  const deadline = new Date(deadlineISO);
  const today = todayISO ? new Date(todayISO) : new Date();
  if (isNaN(deadline.getTime()) || isNaN(today.getTime())) return undefined;
  // Count business days on the [day-after-today .. deadline] range using UTC date arithmetic.
  const d0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const d1 = Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate());
  if (d1 <= d0) return undefined; // deadline today or in the past → not a usable future timeline
  let business = 0;
  for (let t = d0 + 86400000; t <= d1; t += 86400000) {
    const dow = new Date(t).getUTCDay(); // 0=Sun … 6=Sat
    if (dow !== 0 && dow !== 6) business++;
  }
  return Math.max(1, Math.round(business / 5));
}

/** Absolute instant at which the `timeZone` calendar day containing `at` begins. */
export function startOfDayInZone(at: Date, timeZone: string = APP_TIMEZONE): Date {
  const offset = zoneOffsetMs(at, timeZone);
  const wall = new Date(at.getTime() + offset); // wall-clock fields readable via getUTC*
  const startWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  // Re-read the offset at the boundary itself so a DST shift during the day lands on the real midnight.
  const boundary = new Date(startWall - offset);
  const boundaryOffset = zoneOffsetMs(boundary, timeZone);
  return boundaryOffset === offset ? boundary : new Date(startWall - boundaryOffset);
}
