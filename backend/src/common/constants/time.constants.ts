/**
 * Working-time base for ALL budget math (Issue 8).
 *
 * The DAILY head-cost rate is the single base. Everything else is derived from it — never from the stored
 * monthly/hourly columns:
 *   weekly  = daily  × DAYS_PER_WEEK
 *   monthly = weekly × WEEKS_PER_MONTH  ( = daily × DAYS_PER_MONTH )
 */
export const DAYS_PER_WEEK = 5;
export const WEEKS_PER_MONTH = 4;
export const DAYS_PER_MONTH = DAYS_PER_WEEK * WEEKS_PER_MONTH; // 20

/**
 * Hours in one full working day — the divisor that converts a role's part-time effort into effective
 * man-days (Workstream A). A role staffed `workingDays` calendar days at `hoursPerDay` hours/day contributes
 *   effectiveDays = hoursPerDay × workingDays / HOURS_PER_DAY
 * and is costed as `units × effectiveDays × dayRateCents` — the DAILY rate stays the only cost reference.
 * hoursPerDay = HOURS_PER_DAY (8) means full-time, so effectiveDays = workingDays (legacy behaviour).
 */
export const HOURS_PER_DAY = 8;

/** effectiveDays = hoursPerDay × workingDays / HOURS_PER_DAY, rounded to 2dp. */
export const effectiveDays = (hoursPerDay: number, workingDays: number): number =>
  Math.round(((Number(hoursPerDay) || 0) * (Number(workingDays) || 0) * 100) / HOURS_PER_DAY) / 100;

/**
 * Overtime ceiling for a CRUNCH (a hard deadline that can't be met at a normal 8h day). The deterministic
 * crash-to-deadline lever may raise a role's hoursPerDay up to this before it adds more parallel people
 * (Workstream: constraint-driven planning). Never used for a normal plan — only when a deadline forces it.
 */
export const CRUNCH_HOURS_PER_DAY = 12;
