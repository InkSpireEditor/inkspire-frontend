import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TimelineView from './TimelineView.vue'
import { timelineService } from '../services/timeline'

vi.mock('../services/timeline', () => ({
  timelineService: { get: vi.fn() }
}))

/**
 * The exact fixture the backend's own tests use for this route -- two
 * characters, three events, one arc -- with coordinates timeline.process()
 * would compute for it. PX_PER_UNIT is 48 in the component; every pixel
 * assertion below is that arithmetic done by hand.
 */
const TIMELINE_FIXTURE = {
  title: 'Example Timeline',
  maxHeight: 8.0,
  widthStep: 1,
  characters: [
    { key: 'alpha', name: 'Jane Doe', color: 'blue', events: ['first', 'second'] },
    { key: 'beta', name: 'John Smith', color: 'red', events: ['second', 'third'] }
  ],
  events: [
    {
      key: 'first', date: '2001-01-01', description: 'First event',
      characters: ['alpha'], href: '', x1: 1.0, y1: 0.0, x2: 3.75, y2: 1.5
    },
    {
      key: 'second', date: '2001-02', description: 'Second event',
      characters: ['alpha', 'beta'], href: 'https://example.com/', x1: 4.75, y1: 5.0, x2: 7.75, y2: 6.5
    },
    {
      key: 'third', date: '2001-03-01', description: 'Third event',
      characters: ['beta'], href: '', x1: 8.75, y1: 2.5, x2: 11.5, y2: 4.0
    }
  ],
  arcs: [{ name: 'Opening', firstEvent: 'first', lastEvent: 'third' }]
}

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/story/:id', name: 'dashboard', component: { template: '<div />' } },
      { path: '/story/:id/timeline', name: 'timeline', component: TimelineView }
    ]
  })
  await router.push({ name: 'timeline', params: { id: storyId } })
  return router
}

describe('TimelineView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('draws each event as a box at its laid-out position, scaled to pixels', async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Example Timeline')

    const boxes = wrapper.findAll('.events > g')
    expect(boxes).toHaveLength(3)

    expect(boxes[0]?.attributes('transform')).toBe('translate(48, 0)')
    const firstRect = boxes[0]!.find('rect')
    expect(firstRect.attributes('width')).toBe('132')
    expect(firstRect.attributes('height')).toBe('72')
    expect(boxes[0]!.find('.event-date').text()).toBe('2001-01-01')
    expect(boxes[0]!.find('.event-description').text()).toBe('First event')

    expect(boxes[1]?.attributes('transform')).toBe('translate(228, 240)')
    expect(boxes[1]!.find('rect').attributes('width')).toBe('144')

    expect(boxes[2]?.attributes('transform')).toBe('translate(420, 120)')
    expect(boxes[2]!.find('rect').attributes('width')).toBe('132')

    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('600') // (11.5 + widthStep 1) * 48
    // The arcs sit above the events, in a band of their own: the curve peaks 3 units (144px)
    // above the top row, plus 8px of padding, ahead of the events' 8.0 * 48 = 384.
    expect(svg.attributes('height')).toBe('536') // 152 + 384
  })

  it("offers a way back to the story's dashboard", async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('.back-link').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('wraps an event with an href in a link, and a plain one in no link', async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    const boxes = wrapper.findAll('.events > g')
    expect(boxes[0]!.find('a').exists()).toBe(false)
    const link = boxes[1]!.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://example.com/')
    expect(link.text()).toBe('Second event')
  })

  it("draws each character's thread as lines between consecutive event centres, in their colour", async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    const lines = wrapper.findAll('.threads line')
    expect(lines).toHaveLength(2)

    const alphaLine = lines.find((l) => l.attributes('stroke') === 'blue')
    expect(alphaLine?.attributes('x1')).toBe('114')
    expect(alphaLine?.attributes('y1')).toBe('36')
    expect(alphaLine?.attributes('x2')).toBe('300')
    expect(alphaLine?.attributes('y2')).toBe('276')

    const betaLine = lines.find((l) => l.attributes('stroke') === 'red')
    expect(betaLine?.attributes('x1')).toBe('300')
    expect(betaLine?.attributes('y1')).toBe('276')
    expect(betaLine?.attributes('x2')).toBe('486')
    expect(betaLine?.attributes('y2')).toBe('156')
  })

  it('draws an arc as a labelled bracket spanning its first and last event', async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    const guides = wrapper.findAll('.arc-guide')
    expect(guides).toHaveLength(2)
    expect(guides[0]?.attributes('x1')).toBe('24')
    // From one unit above the top row down to the bottom of the drawing, (8.0 - 1) * 48.
    expect(guides[0]?.attributes('y1')).toBe('-48')
    expect(guides[0]?.attributes('y2')).toBe('336')
    expect(guides[1]?.attributes('x1')).toBe('576')

    const curve = wrapper.find('.arc-curve')
    // Starts one unit above the top row, with its control point five units above.
    expect(curve.attributes('d')).toBe('M 24 -48 Q 300 -240 576 -48')

    expect(wrapper.find('.arc-label').text()).toBe('Opening')
    expect(wrapper.find('.arc-label').attributes('y')).toBe('-96')
  })

  it("leaves room above the events for an arc's curve and its label", async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    // The drawing is shifted down by the band, so the curve's peak (-48 + (-240 - -48) / 2 =
    // -144, as a quadratic reaches half the way to its control point) lands inside the SVG.
    const band = Number(wrapper.find('svg > g').attributes('transform')!.match(/, ([\d.]+)\)/)![1])
    expect(band).toBeGreaterThan(144)
    expect(band + Number(wrapper.find('.arc-label').attributes('y'))).toBeGreaterThan(0)
    expect(Number(wrapper.find('svg').attributes('height'))).toBe(band + 384)
  })

  it('keeps the events-only height for a timeline with no arcs', async () => {
    vi.mocked(timelineService.get).mockResolvedValue({ ...TIMELINE_FIXTURE, arcs: [] })
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('svg').attributes('height')).toBe('384') // maxHeight 8.0 * 48
    expect(wrapper.find('svg > g').attributes('transform')).toBe('translate(0, 0)')
  })

  it('lists each character in the legend with its authored colour', async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    const swatches = wrapper.findAll('.swatch')
    expect(swatches).toHaveLength(2)
    expect(swatches[0]?.attributes('style')).toContain('background-color: blue')
    expect(wrapper.text()).toContain('Jane Doe')
    expect(wrapper.text()).toContain('John Smith')
  })

  it('says so when a timeline has no events yet', async () => {
    vi.mocked(timelineService.get).mockResolvedValue({
      title: 'Bare Timeline', maxHeight: 0, widthStep: 1, characters: [], events: [], arcs: []
    })
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('No events yet.')
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('shows an error when the timeline fails to load', async () => {
    vi.mocked(timelineService.get).mockRejectedValue(new Error('This story has no timeline.yaml.'))
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('.error').text()).toBe('This story has no timeline.yaml.')
  })

  it('reloads when the route moves to a different story without remounting', async () => {
    vi.mocked(timelineService.get).mockResolvedValue(TIMELINE_FIXTURE)
    const router = await routerAt('a1b2c3d4e5f60718')
    mount(TimelineView, { global: { plugins: [router] } })
    await flushPromises()

    await router.push({ name: 'timeline', params: { id: 'other000000000018' } })
    await flushPromises()

    expect(timelineService.get).toHaveBeenCalledWith('other000000000018')
  })
})
