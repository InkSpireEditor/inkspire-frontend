/**
 * Times as a reader reads them, as plain functions so they are testable without a DOM --
 * the same split as `zoom.ts` and `cursor.ts`.
 */

/** How fresh a time must be to be called "just now" rather than counted in minutes. */
const JUST_NOW_MS = 45_000

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/**
 * How long ago an ISO 8601 time was, against `now` (a millisecond timestamp, so a test
 * fixes the clock). Under 45 seconds is "just now", then minutes, hours, days, months
 * and years. A count is rounded down, so a time 59 minutes 40 seconds ago is "59 minutes
 * ago" and not "60 minutes ago"; a month is 30 days and the count stops at 11 until a
 * year has passed. A time in the future (clock skew) is "just now" too, and an
 * unparseable string answers `''`, which callers render as nothing.
 */
export const timeAgo = (iso: string, now: number): string => {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''

  const difference = now - then
  if (difference < JUST_NOW_MS) return 'just now'
  if (difference < HOUR_MS) {
    return formatter.format(-Math.max(1, Math.floor(difference / MINUTE_MS)), 'minute')
  }
  if (difference < DAY_MS) return formatter.format(-Math.floor(difference / HOUR_MS), 'hour')
  if (difference < MONTH_MS) return formatter.format(-Math.floor(difference / DAY_MS), 'day')
  if (difference < YEAR_MS) {
    return formatter.format(-Math.min(11, Math.floor(difference / MONTH_MS)), 'month')
  }
  return formatter.format(-Math.floor(difference / YEAR_MS), 'year')
}
