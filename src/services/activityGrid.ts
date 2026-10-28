/**
 * The activity grid's layout, as plain functions so they are testable without a DOM -- the
 * same split as `homeStats.ts` and `zoom.ts`.
 *
 * Dates are ISO day strings (`YYYY-MM-DD`). Date arithmetic is done in UTC with
 * `Date.UTC(y, m - 1, d)`, so a daylight-saving change never moves a day: a day is
 * 86 400 000 ms whatever the local clock did on it.
 */
import type { ActivityDay } from './activity'

const DAY_MS = 86_400_000

const WEEKS = 52
const DAYS_PER_WEEK = 7

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parse = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

const format = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10)

/** The local calendar day of `now`, as an ISO day string. */
export const todayIso = (now = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

/** `day` shifted `n` days. */
export const addDays = (day: string, n: number): string => format(parse(day) + n * DAY_MS)

/** The day of the week of `day`: Monday = 0 ... Sunday = 6. */
export const weekday = (day: string): number => (new Date(parse(day)).getUTCDay() + 6) % 7

/** The Monday of the week `day` is in. */
export const monday = (day: string): string => addDays(day, -weekday(day))

/** `day` as a reader reads it: `Tue 3 Mar 2026`. Written here rather than by `Intl`, whose
 * month abbreviations differ between ICU versions. */
export const longDate = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number)
  return `${DAY_NAMES[weekday(day)]} ${d} ${MONTH_NAMES[m! - 1]} ${y}`
}

/** One cell of the grid. */
export interface GridCell {
  date: string
  words: number
  /** 0 for an empty day, 1 to 4 by the year's own distribution. */
  level: number
  /** True for a day after `today` in the last column; not drawn. */
  future: boolean
}

export interface Grid {
  /** 52 columns of 7 cells, Monday on top. */
  columns: GridCell[][]
}

/**
 * 52 columns of 7 cells, Monday on top. The last column is the week containing `today`;
 * the first starts on `monday(today) - 51 weeks`. A day missing from `days` has 0 words.
 */
export const buildGrid = (days: ActivityDay[], today: string): Grid => {
  const words = new Map(days.map((day) => [day.date, day.words]))
  const firstMonday = addDays(monday(today), -DAYS_PER_WEEK * (WEEKS - 1))

  const columns: GridCell[][] = []
  for (let week = 0; week < WEEKS; week++) {
    const column: GridCell[] = []
    for (let row = 0; row < DAYS_PER_WEEK; row++) {
      const date = addDays(firstMonday, week * DAYS_PER_WEEK + row)
      column.push({ date, words: words.get(date) ?? 0, level: 0, future: date > today })
    }
    columns.push(column)
  }

  applyLevels(columns)
  return { columns }
}

/**
 * The levels, from the grid's own distribution: the thresholds are the non-zero days'
 * 25th, 50th and 75th percentile by nearest rank, and a day's level is
 * `1 + (words > t1) + (words > t2) + (words > t3)`, so 1 to 4. One very large day does
 * not flatten the others, because the thresholds are read from the days that have words
 * rather than scaled to the largest.
 */
const applyLevels = (columns: GridCell[][]): void => {
  const cells = columns.flat()
  const sorted = cells.map((cell) => cell.words).filter((words) => words > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return

  const rank = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]!
  const thresholds = [rank(0.25), rank(0.5), rank(0.75)]

  for (const cell of cells) {
    if (cell.words > 0) {
      cell.level = 1 + thresholds.filter((threshold) => cell.words > threshold).length
    }
  }
}

/**
 * For each column, the month of its Monday (`Jan`...), set only where it differs from the
 * previous column's. The first column's label is dropped when the second column has one:
 * two names side by side would run together.
 */
export const monthLabels = (columns: GridCell[][]): (string | null)[] => {
  const months = columns.map((column) => MONTH_NAMES[Number(column[0]!.date.split('-')[1]) - 1]!)
  const labels = months.map((month, index) => (month === months[index - 1] ? null : month))
  if (labels.length > 1 && labels[1] !== null) labels[0] = null
  return labels
}

/** What the grid shows, added up: the words of the days it draws and its busiest day. */
export interface Summary {
  total: number
  busiest: GridCell | null
}

/** The days outside the grid's 52 weeks are not in it, and so not in what it adds up. */
export const summarise = (grid: Grid): Summary => {
  let total = 0
  let busiest: GridCell | null = null
  for (const cell of grid.columns.flat()) {
    if (cell.future || cell.words === 0) continue
    total += cell.words
    if (busiest === null || cell.words > busiest.words) busiest = cell
  }
  return { total, busiest }
}
