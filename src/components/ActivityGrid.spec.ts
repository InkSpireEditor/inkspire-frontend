import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityGrid from './ActivityGrid.vue'
import type { ActivityDay } from '../services/activity'

const today = '2026-10-28' // a Wednesday

const DAYS: ActivityDay[] = [
  { date: '2026-10-26', words: 100 },
  { date: '2026-10-27', words: 400 },
  { date: '2026-10-28', words: 0 },
  { date: '2026-09-10', words: 1200 },
  { date: '2026-08-20', words: 2400 },
]

const mountGrid = (days: ActivityDay[] = DAYS) =>
  mount(ActivityGrid, { props: { days, today } })

describe('ActivityGrid.vue', () => {
  it('draws 52 columns and one cell per drawn day', () => {
    const wrapper = mountGrid()

    expect(wrapper.findAll('.column')).toHaveLength(52)
    // 52 * 7 days minus the 4 after today in the last column.
    expect(wrapper.findAll('.cell')).toHaveLength(360)
  })

  it('draws every column as a direct child of the one grid, seven rows tall', () => {
    const wrapper = mountGrid()

    const grid = wrapper.find('.grid')
    expect(grid.findAll(':scope > .column')).toHaveLength(52)
    expect(wrapper.findAll('.column')[0]!.findAll('.cell')).toHaveLength(7)
  })

  it('draws no cell for a day after today', () => {
    const wrapper = mountGrid()

    const last = wrapper.findAll('.column')[51]!
    expect(last.findAll('.cell')).toHaveLength(3)
  })

  it('classes a cell by its level', () => {
    const wrapper = mountGrid()

    const classes = wrapper
      .findAll('.cell')
      .flatMap((cell) => cell.classes())
      .filter((name) => name.startsWith('level-'))
    expect(classes).toContain('level-0')
    expect(classes).toContain('level-1')
    expect(classes).toContain('level-4')
    expect(wrapper.find('[data-date="2026-10-28"]').classes()).toContain('level-0')
    expect(wrapper.find('[data-date="2026-08-20"]').classes()).toContain('level-4')
  })

  it('names the total and the busiest day, with its date, for a screen reader', () => {
    const label = mountGrid().find('.grid').attributes('aria-label')!

    expect(label).toBe(
      'Words written: 4,100 in the last year. The busiest day was Thu 20 Aug 2026, with 2,400 words.'
    )
  })

  it('is one image for assistive technology, with its cells hidden from it', () => {
    const wrapper = mountGrid()

    expect(wrapper.find('.grid').attributes('role')).toBe('img')
    expect(wrapper.find('[data-date="2026-10-26"]').attributes('aria-hidden')).toBe('true')
  })

  it('shows a caption with the total, or the empty caption', () => {
    expect(mountGrid().find('.caption').text()).toBe('4,100 words in the last year')
    expect(mountGrid([]).find('.caption').text()).toBe('Nothing written in the last year')
  })

  it('leaves a day before the first column out of the total and the table', async () => {
    // The first column starts on 2025-11-03; the activity route answers up to 6 days earlier.
    const wrapper = mountGrid([
      { date: '2025-11-02', words: 5000 },
      { date: '2026-10-27', words: 400 },
    ])

    expect(wrapper.find('.caption').text()).toBe('400 words in the last year')
    await wrapper.find('.view-toggle').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  })

  it('shows one tooltip for the cell under the pointer, and hides it on leave', async () => {
    const wrapper = mountGrid()
    expect(wrapper.find('.tip').exists()).toBe(false)

    await wrapper.find('[data-date="2026-10-27"]').trigger('pointerover')
    const tip = wrapper.find('.tip')
    expect(tip.exists()).toBe(true)
    expect(tip.find('strong').text()).toBe('400 words')
    expect(tip.text()).toContain('Tue 27 Oct 2026')

    await wrapper.find('.grid').trigger('pointerleave')
    expect(wrapper.find('.tip').exists()).toBe(false)
  })

  it('keeps the tooltip outside the scrolling element, which would cut it off', async () => {
    const wrapper = mountGrid()

    await wrapper.find('[data-date="2026-10-27"]').trigger('pointerover')

    expect(wrapper.find('.scroller .tip').exists()).toBe(false)
    expect(wrapper.find('.stage > .tip').exists()).toBe(true)
  })

  it('shows the tooltip for an empty day as No words', async () => {
    const wrapper = mountGrid()

    await wrapper.find('[data-date="2026-10-28"]').trigger('pointerover')

    expect(wrapper.find('.tip strong').exists()).toBe(false)
    expect(wrapper.find('.tip span').text()).toBe('No words')
  })

  it('lists only the days that have words in the table twin, newest first', async () => {
    const wrapper = mountGrid()
    await wrapper.find('.view-toggle').trigger('click')

    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows).toEqual([
      'Tue 27 Oct 2026400',
      'Mon 26 Oct 2026100',
      'Thu 10 Sep 20261,200',
      'Thu 20 Aug 20262,400',
    ])
  })

  it('says so in the table when nothing was written', async () => {
    const wrapper = mountGrid([])
    await wrapper.find('.view-toggle').trigger('click')

    expect(wrapper.find('.empty').text()).toBe('Nothing written.')
  })

  it('swaps back to the grid', async () => {
    const wrapper = mountGrid()
    await wrapper.find('.view-toggle').trigger('click')
    expect(wrapper.find('.grid').exists()).toBe(false)

    await wrapper.find('.view-toggle').trigger('click')
    expect(wrapper.find('.grid').exists()).toBe(true)
    expect(wrapper.find('.view-toggle').attributes('aria-pressed')).toBe('false')
  })

  it('has one month slot per column, named once per run of columns', () => {
    const wrapper = mountGrid()

    const months = wrapper.findAll('.month').map((month) => month.text())
    expect(months).toHaveLength(52)
    expect(months.filter((name) => name !== '')).toHaveLength(12)
    expect(months[51]).toBe('')
  })

  it('names Monday, Wednesday and Friday beside the seven rows', () => {
    const names = mountGrid()
      .findAll('.weekdays span')
      .map((name) => name.text())

    expect(names).toEqual(['Mon', '', 'Wed', '', 'Fri', '', ''])
  })
})
