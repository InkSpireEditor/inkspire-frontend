import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BarChart from './BarChart.vue'

const BARS = [
  { label: 'Alpha', value: 1200, detail: '2 chapters' },
  { label: 'Beta', value: 300, detail: '1 chapter' },
  { label: 'Gamma', value: 0 }
]

const mountChart = (props: Record<string, unknown> = {}) =>
  mount(BarChart, { props: { title: 'Words per story', unit: 'words', bars: BARS, ...props } })

describe('BarChart.vue', () => {
  it('draws a bar and its value for each row', () => {
    const wrapper = mountChart()

    const rows = wrapper.findAll('.row')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.find('.label').text()).toBe('Alpha')
    expect(rows[0]?.find('.value').text()).toBe('1,200')
    expect(rows[2]?.find('.value').text()).toBe('0')
  })

  it('sets each bar\'s length against the longest, and draws a zero as nothing', () => {
    const wrapper = mountChart()

    const lengths = wrapper.findAll('.bar').map((bar) => (bar.element as HTMLElement).style.getPropertyValue('--share'))
    expect(lengths).toEqual(['1', '0.25', '0'])
    expect(wrapper.findAll('.bar')[2]?.classes()).toContain('empty')
  })

  it('draws no length at all when every value is zero', () => {
    const wrapper = mountChart({ bars: [{ label: 'Alpha', value: 0 }] })

    expect((wrapper.find('.bar').element as HTMLElement).style.getPropertyValue('--share')).toBe('0')
  })

  it('names each row for a screen reader with its value and detail, and makes it focusable', () => {
    const row = mountChart().findAll('.row')[0]!

    expect(row.attributes('aria-label')).toBe('Alpha: 1,200 words, 2 chapters')
    expect(row.attributes('tabindex')).toBe('0')
  })

  it('carries the value, name and detail in a tooltip that hover and focus show', () => {
    const tip = mountChart().findAll('.row')[1]!.find('.tip')

    expect(tip.attributes('role')).toBe('tooltip')
    expect(tip.find('strong').text()).toBe('300 words')
    expect(tip.text()).toContain('Beta')
    expect(tip.text()).toContain('1 chapter')
  })

  it('shows a caption under the title when it has one', () => {
    expect(mountChart({ caption: '1,500 words in all' }).find('.caption').text()).toBe(
      '1,500 words in all'
    )
    expect(mountChart().find('.caption').exists()).toBe(false)
  })

  it('swaps to a table of the same numbers, and back', async () => {
    const wrapper = mountChart()
    const toggle = wrapper.find('.view-toggle')
    expect(toggle.text()).toBe('Table')

    await toggle.trigger('click')

    expect(wrapper.find('.bars').exists()).toBe(false)
    const cells = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(cells[0]).toContain('Alpha')
    expect(cells[0]).toContain('2 chapters')
    expect(cells[0]).toContain('1,200')
    expect(wrapper.find('thead').text()).toContain('Words')
    expect(wrapper.find('.view-toggle').attributes('aria-pressed')).toBe('true')

    await wrapper.find('.view-toggle').trigger('click')
    expect(wrapper.find('.bars').exists()).toBe(true)
  })

  it('leaves out the detail column when no row has one', async () => {
    const wrapper = mountChart({ bars: [{ label: 'draft', value: 3 }] })

    await wrapper.find('.view-toggle').trigger('click')

    expect(wrapper.findAll('thead th')).toHaveLength(2)
  })
})
