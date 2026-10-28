import { describe, it, expect } from 'vitest'
import {
  addDays,
  buildGrid,
  longDate,
  monthLabels,
  monday,
  summarise,
  todayIso,
  weekday,
} from './activityGrid'
import type { ActivityDay } from './activity'

const day = (date: string, words: number): ActivityDay => ({ date, words })

describe('todayIso', () => {
  it('answers the local calendar day', () => {
    expect(todayIso(new Date(2026, 9, 28))).toBe('2026-10-28')
    expect(todayIso(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('addDays and weekday', () => {
  it('moves a day across a month and a year boundary', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('never moves a day on a daylight-saving change', () => {
    // 2026-10-25 is a DST change in most of Europe: 23 hours long locally, 24 in UTC.
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('numbers the week Monday = 0 ... Sunday = 6', () => {
    expect(weekday('2026-10-26')).toBe(0) // Monday
    expect(weekday('2026-11-01')).toBe(6) // Sunday
  })
})

describe('buildGrid', () => {
  it('builds exactly 52 columns of 7 cells', () => {
    const grid = buildGrid([], '2026-10-28')
    expect(grid.columns).toHaveLength(52)
    for (const column of grid.columns) {
      expect(column).toHaveLength(7)
    }
  })

  it('puts the week containing today in the last column, Monday first', () => {
    // 2026-10-28 is a Wednesday.
    const grid = buildGrid([], '2026-10-28')
    const last = grid.columns[51]!
    expect(last[0]!.date).toBe('2026-10-26')
    expect(last[2]!.date).toBe('2026-10-28')
    expect(last[3]!.date).toBe('2026-10-29')
  })

  it('marks the days after today in the last column as future', () => {
    const grid = buildGrid([], '2026-10-28')
    const last = grid.columns[51]!
    expect(last[0]!.future).toBe(false)
    expect(last[2]!.future).toBe(false)
    expect(last[3]!.future).toBe(true)
    expect(last[6]!.future).toBe(true)
  })

  it('starts the first column 51 weeks before today\'s Monday', () => {
    const grid = buildGrid([], '2026-10-28')
    expect(grid.columns[0]![0]!.date).toBe('2025-11-03')
  })

  it('keeps a day 364 days ago outside the grid and 363 inside, when today is a Sunday', () => {
    // 2026-11-01 is a Sunday; its Monday is 2026-10-26, and 51 weeks before it is 2025-11-03.
    const grid = buildGrid([], '2026-11-01')
    expect(grid.columns[0]![0]!.date).toBe('2025-11-03')
    // 364 days before today is 2025-11-02, before the first column's Monday.
    expect(grid.columns[0]!.some((cell) => cell.date === '2025-11-02')).toBe(false)
    // 363 days before is 2025-11-03, inside the first column.
    expect(grid.columns[0]!.some((cell) => cell.date === '2025-11-03')).toBe(true)
  })

  it('gives a day 0 words when it is missing from the input', () => {
    const grid = buildGrid([day('2026-10-28', 40)], '2026-10-28')
    const cell = grid.columns[51]!.find((one) => one.date === '2026-10-28')!
    expect(cell.words).toBe(40)
    const empty = grid.columns[51]!.find((one) => one.date === '2026-10-27')!
    expect(empty.words).toBe(0)
  })

  it('aligns every column on a Monday', () => {
    const grid = buildGrid([], '2026-10-28')
    for (const column of grid.columns) {
      expect(weekday(column[0]!.date)).toBe(0)
    }
  })

  it('spans a year boundary', () => {
    const grid = buildGrid([], '2026-01-01')
    expect(grid.columns[0]![0]!.date).toBe('2025-01-06')
    expect(grid.columns[51]![0]!.date).toBe('2025-12-29')
  })
})

describe('levels', () => {
  const gridOf = (days: ActivityDay[], today: string) => buildGrid(days, today)
  const levels = (grid: ReturnType<typeof buildGrid>) =>
    grid.columns.flat().filter((cell) => !cell.future && cell.words > 0).map((cell) => cell.level)

  it('gives a zero day level 0', () => {
    const grid = gridOf([], '2026-10-28')
    expect(grid.columns[0]![0]!.level).toBe(0)
  })

  it('levels a long tail from the year\'s own distribution', () => {
    const today = '2026-10-28'
    // Nine 100-word days and one 10,000-word day, on distinct dates.
    const nine = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
      '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09'].map((date) => day(date, 100))
    const all = [...nine, day('2026-09-10', 10_000)]
    const levelsOf = levels(gridOf(all, today))
    // The thresholds are the 10 non-zero days' quartiles by nearest rank: 100, 100, 100.
    // A 100-word day is level 1 (above none of them); the 10,000-word day is level 4. One
    // very large day does not flatten the others into its own level.
    expect(levelsOf.filter((level) => level === 1)).toHaveLength(9)
    expect(levels(gridOf(all, today))).toContain(4)
  })

  it('collapses the thresholds with fewer than four non-zero days', () => {
    const levelsOf = levels(gridOf([day('2026-10-26', 50), day('2026-10-27', 100)], '2026-10-28'))
    // Nearest rank of two items: the 25th and 50th percentile are both the first (50), the
    // 75th is the second (100). 50 is level 1; 100 is above both 50s and not above 100.
    expect(levelsOf).toEqual([1, 3])
  })

  it('levels nothing above 0 when every day is empty', () => {
    const grid = gridOf([], '2026-10-28')
    expect(grid.columns.flat().every((cell) => cell.level === 0)).toBe(true)
  })
})

describe('monthLabels', () => {
  it('labels a column when its Monday changes month, and not otherwise', () => {
    const grid = buildGrid([], '2026-10-28')
    const labels = monthLabels(grid.columns)
    expect(labels).toHaveLength(52)
    // Not every column is labelled; a run of columns in one month carries one label.
    const named = labels.filter((label) => label !== null)
    expect(named.length).toBeLessThan(52)
    expect(named.length).toBeGreaterThan(10)
    // The first column's Monday is 2025-11-03 (Nov) and the second column's is Nov too,
    // so the second is left blank and the first keeps its label.
    expect(labels[0]).toBe('Nov')
    expect(labels[1]).toBeNull()
  })

  it('names a month at a year boundary', () => {
    const grid = buildGrid([], '2026-01-28')
    const labels = monthLabels(grid.columns)
    expect(labels).toContain('Jan')
    expect(labels).toContain('Dec')
  })
})

describe('longDate', () => {
  it('writes the weekday, the day, the month and the year', () => {
    expect(longDate('2026-03-03')).toBe('Tue 3 Mar 2026')
    expect(longDate('2026-09-10')).toBe('Thu 10 Sep 2026')
    expect(longDate('2026-11-01')).toBe('Sun 1 Nov 2026')
  })
})

describe('monday', () => {
  it('is the day itself on a Monday and the one before on a Sunday', () => {
    expect(monday('2026-10-26')).toBe('2026-10-26')
    expect(monday('2026-11-01')).toBe('2026-10-26')
  })
})

describe('summarise', () => {
  it('adds up the days the grid draws and names the busiest', () => {
    const grid = buildGrid(
      [day('2026-10-26', 100), day('2026-10-27', 40), day('2026-10-28', 1200)],
      '2026-10-28'
    )
    const { total, busiest } = summarise(grid)
    expect(total).toBe(1340)
    expect(busiest?.date).toBe('2026-10-28')
    expect(busiest?.words).toBe(1200)
  })

  it('leaves out a day before the first column, which the grid does not draw', () => {
    // The first column starts on 2025-11-03, so 2025-11-02 is outside the 52 weeks.
    const grid = buildGrid([day('2025-11-02', 500), day('2025-11-03', 7)], '2026-10-28')
    expect(summarise(grid).total).toBe(7)
  })

  it('leaves out a day after today', () => {
    const grid = buildGrid([day('2026-10-29', 500), day('2026-10-28', 7)], '2026-10-28')
    expect(summarise(grid).total).toBe(7)
  })

  it('answers 0 and no busiest day for nothing written', () => {
    expect(summarise(buildGrid([], '2026-10-28'))).toEqual({ total: 0, busiest: null })
  })

  it('names the earlier of two equally busy days once', () => {
    const grid = buildGrid([day('2026-10-26', 50), day('2026-10-27', 50)], '2026-10-28')
    expect(summarise(grid).busiest?.date).toBe('2026-10-26')
  })
})
