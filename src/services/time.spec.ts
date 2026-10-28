import { describe, it, expect } from 'vitest'
import { timeAgo } from './time'

/** A fixed `now`, so every boundary is stated against the same instant. */
const NOW = Date.parse('2026-10-28T12:01:00Z')

describe('timeAgo', () => {
  /** A time `ms` milliseconds before `NOW`, as the ISO string the API sends. */
  const before = (ms: number) => new Date(NOW - ms).toISOString()
  const SECOND = 1000
  const MINUTE = 60 * SECOND
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR

  it('says "just now" under 45 seconds', () => {
    expect(timeAgo(before(0), NOW)).toBe('just now')
    expect(timeAgo(before(44 * SECOND), NOW)).toBe('just now')
  })

  it('counts a minute from 45 seconds', () => {
    expect(timeAgo(before(45 * SECOND), NOW)).toBe('1 minute ago')
    expect(timeAgo(before(89 * SECOND), NOW)).toBe('1 minute ago')
  })

  it('says "just now" for a time in the future (clock skew)', () => {
    expect(timeAgo(before(-5 * MINUTE), NOW)).toBe('just now')
  })

  it('rounds minutes down, so the last of the hour is 59 and not 60', () => {
    expect(timeAgo(before(30 * MINUTE), NOW)).toBe('30 minutes ago')
    expect(timeAgo(before(59 * MINUTE + 40 * SECOND), NOW)).toBe('59 minutes ago')
  })

  it('rounds hours down, so the last of the day is 23 and not 24', () => {
    expect(timeAgo(before(HOUR), NOW)).toBe('1 hour ago')
    expect(timeAgo(before(6 * HOUR), NOW)).toBe('6 hours ago')
    expect(timeAgo(before(23 * HOUR + 40 * MINUTE), NOW)).toBe('23 hours ago')
  })

  it('counts days from 24 hours, and rounds them down', () => {
    expect(timeAgo(before(DAY), NOW)).toBe('yesterday')
    expect(timeAgo(before(2 * DAY + 20 * HOUR), NOW)).toBe('2 days ago')
    expect(timeAgo(before(29 * DAY + 20 * HOUR), NOW)).toBe('29 days ago')
  })

  it('counts months from 30 days, and stops at 11 until a year has passed', () => {
    expect(timeAgo(before(30 * DAY), NOW)).toBe('last month')
    expect(timeAgo(before(65 * DAY), NOW)).toBe('2 months ago')
    expect(timeAgo(before(364 * DAY + 20 * HOUR), NOW)).toBe('11 months ago')
  })

  it('counts years from 365 days, and rounds them down', () => {
    expect(timeAgo(before(365 * DAY), NOW)).toBe('last year')
    expect(timeAgo(before(2 * 365 * DAY + 300 * DAY), NOW)).toBe('2 years ago')
  })

  it('answers nothing for an unparseable string', () => {
    expect(timeAgo('not a time', NOW)).toBe('')
  })

  it('reads an ISO string with an offset as the instant it names', () => {
    expect(timeAgo('2026-10-28T14:01:00+02:00', NOW)).toBe('just now')
    expect(timeAgo('2026-10-28T13:01:00+02:00', NOW)).toBe('1 hour ago')
  })
})
