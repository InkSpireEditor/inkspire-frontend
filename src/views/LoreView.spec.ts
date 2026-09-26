import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import LoreView from './LoreView.vue'
import { loreService, type LoreGraph, type LoreNode } from '../services/lore'

vi.mock('../services/lore', async () => {
  const actual = await vi.importActual<typeof import('../services/lore')>('../services/lore')
  return { ...actual, loreService: { getGraph: vi.fn(), getEntity: vi.fn() } }
})

/**
 * A stand-in for force-graph: every accessor records what it was handed and
 * returns itself, so a test can read back exactly how the view configured the
 * instance without a real canvas or a real simulation anywhere near it.
 *
 * Built inside `vi.hoisted` because `vi.mock` is lifted above every other
 * statement in this file -- a class declared normally would not exist yet.
 */
const { FakeGraph } = vi.hoisted(() => {
  interface FakeForce {
    distance: ReturnType<typeof vi.fn>
    strength: ReturnType<typeof vi.fn>
    distanceMax: ReturnType<typeof vi.fn>
  }

  class FakeGraph {
    static latest: FakeGraph | null = null

    element: HTMLElement
    config: Record<string, unknown> = {}
    forces: Record<string, unknown> = {}
    fakeForces: Record<string, FakeForce> = {}
    destroyed = false
    zoomToFitCalls: unknown[][] = []

    constructor(element: HTMLElement) {
      this.element = element
      FakeGraph.latest = this

      const accessors = [
        'graphData', 'backgroundColor', 'nodeId', 'nodeRelSize', 'nodeVal', 'nodeColor',
        'nodeLabel', 'nodeCanvasObjectMode', 'nodeCanvasObject', 'linkColor', 'linkLabel',
        'linkDirectionalArrowLength', 'linkDirectionalArrowRelPos', 'onEngineStop',
        'onNodeClick', 'width', 'height', 'centerAt', 'zoom'
      ]
      for (const name of accessors) {
        ;(this as unknown as Record<string, unknown>)[name] = (value: unknown) => {
          this.config[name] = value
          return this
        }
      }
    }

    d3Force(name: string, force?: unknown) {
      if (force !== undefined) {
        this.forces[name] = force
        return this
      }
      if (!this.fakeForces[name]) {
        const fake: FakeForce = { distance: vi.fn(), strength: vi.fn(), distanceMax: vi.fn() }
        fake.strength.mockReturnValue(fake)
        fake.distance.mockReturnValue(fake)
        this.fakeForces[name] = fake
      }
      return this.fakeForces[name]
    }

    zoomToFit(...args: unknown[]) {
      this.zoomToFitCalls.push(args)
      return this
    }

    _destructor() {
      this.destroyed = true
    }
  }

  return { FakeGraph }
})

vi.mock('force-graph', () => ({ default: FakeGraph }))

// jsdom has no ResizeObserver, and this view observes its canvas container.
class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver)

const GRAPH_FIXTURE: LoreGraph = {
  nodes: [
    {
      id: 'https://example.test/entity#Doe', label: 'Jane Doe', type: 'Character',
      types: ['Character'], attrs: { description: ['Steady.'] }, degree: 1
    },
    {
      id: 'https://example.test/entity#ExampleGuild', label: 'Example Guild', type: 'Guild',
      types: ['Guild', 'Organization'], attrs: {}, degree: 1
    }
  ],
  links: [
    {
      source: 'https://example.test/entity#Doe',
      target: 'https://example.test/entity#ExampleGuild',
      label: 'memberOf'
    }
  ]
}

async function routerAt(storyId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/story/:id/lore', name: 'lore', component: LoreView }]
  })
  await router.push({ name: 'lore', params: { id: storyId } })
  return router
}

/** Mounts the view with the graph loaded and force-graph configured. */
async function mountLoaded(graph: LoreGraph = GRAPH_FIXTURE) {
  vi.mocked(loreService.getGraph).mockResolvedValue(graph)
  const router = await routerAt('a1b2c3d4e5f60718')
  const wrapper = mount(LoreView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router, fake: FakeGraph.latest! }
}

describe('LoreView.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    FakeGraph.latest = null
  })

  it('fetches the story\'s graph and hands it to force-graph', async () => {
    const { fake } = await mountLoaded()

    expect(loreService.getGraph).toHaveBeenCalledWith('a1b2c3d4e5f60718')
    expect(fake.config.graphData).toBe(GRAPH_FIXTURE)
    expect(fake.config.nodeId).toBe('id')
  })

  it('counts what the graph holds', async () => {
    const { wrapper } = await mountLoaded()

    expect(wrapper.text()).toContain('2 entities · 1 relations')
  })

  it('sizes a node by its degree, as area rather than radius', async () => {
    const { fake } = await mountLoaded()

    const nodeVal = fake.config.nodeVal as (node: LoreNode) => number
    expect(nodeVal(GRAPH_FIXTURE.nodes[0]!)).toBe(2)
    expect(nodeVal({ ...GRAPH_FIXTURE.nodes[0]!, degree: 8 })).toBe(9)
  })

  it('colours a node by its type and a link by its predicate', async () => {
    const { fake } = await mountLoaded()

    const nodeColor = fake.config.nodeColor as (node: LoreNode) => string
    // Two types, alphabetically Character then Guild, so evenly spaced hues.
    expect(nodeColor(GRAPH_FIXTURE.nodes[0]!)).toBe('hsl(0, 62%, 55%)')
    expect(nodeColor(GRAPH_FIXTURE.nodes[1]!)).toBe('hsl(180, 62%, 55%)')

    const linkColor = fake.config.linkColor as (link: { label: string }) => string
    expect(linkColor({ label: 'memberOf' })).toBe('hsl(0, 62%, 55%)')
    expect(linkColor({ label: 'unknownPredicate' })).toBe('#999')
  })

  it('escapes a link label, which force-graph inserts as innerHTML', async () => {
    const { fake } = await mountLoaded()

    const linkLabel = fake.config.linkLabel as (link: { label: string }) => string
    expect(linkLabel({ label: '<b>memberOf</b>' })).toBe('&lt;b&gt;memberOf&lt;/b&gt;')
  })

  it('installs the gravity force, and spaces links and charge past d3\'s tight defaults', async () => {
    const { fake } = await mountLoaded()

    expect(typeof fake.forces.gravity).toBe('function')
    expect(fake.fakeForces.link?.distance).toHaveBeenCalledWith(34 * 1.6)
    expect(fake.fakeForces.charge?.strength).toHaveBeenCalledWith(-55 * 1.6)
    expect(fake.fakeForces.charge?.distanceMax).toHaveBeenCalledWith(800)
  })

  it('pulls an edgeless node back toward the origin when gravity runs', async () => {
    const { fake } = await mountLoaded()

    const drifting = GRAPH_FIXTURE.nodes[0] as LoreNode & {
      x: number; y: number; vx: number; vy: number
    }
    drifting.x = 100
    drifting.y = -200
    drifting.vx = 0
    drifting.vy = 0

    const gravity = fake.forces.gravity as (alpha: number) => void
    gravity(1)

    expect(drifting.vx).toBeLessThan(0) // pulled left, back toward x = 0
    expect(drifting.vy).toBeGreaterThan(0) // pulled down, back toward y = 0
  })

  it('frames the graph once it first settles, and not again after that', async () => {
    const { fake } = await mountLoaded()

    const onEngineStop = fake.config.onEngineStop as () => void
    onEngineStop()
    onEngineStop()

    expect(fake.zoomToFitCalls).toHaveLength(1)
  })

  it('draws a label under each node, and drops it when zoomed too far out', async () => {
    const { fake } = await mountLoaded()

    const draw = fake.config.nodeCanvasObject as (
      node: LoreNode & { x: number; y: number },
      ctx: unknown,
      scale: number
    ) => void
    const ctx = { font: '', fillStyle: '', textAlign: '', textBaseline: '', fillText: vi.fn() }
    const node = { ...GRAPH_FIXTURE.nodes[0]!, x: 10, y: 20 }

    draw(node, ctx, 1)
    // degree 1 -> radius 5 * sqrt(2) ~= 7.07, label one pixel below that.
    expect(ctx.fillText).toHaveBeenCalledWith('Jane Doe', 10, 20 + 5 * Math.SQRT2 + 1)

    ctx.fillText.mockClear()
    draw(node, ctx, 8) // 12 / 8 = 1.5px, unreadable
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('says so when a lorebook has no entities yet', async () => {
    const { wrapper } = await mountLoaded({ nodes: [], links: [] })

    expect(wrapper.text()).toContain('This lorebook has no entities yet.')
    expect(FakeGraph.latest).toBeNull()
  })

  it('shows an error when the graph fails to load', async () => {
    vi.mocked(loreService.getGraph).mockRejectedValue(new Error('This story has no lorebook.'))
    const router = await routerAt('a1b2c3d4e5f60718')

    const wrapper = mount(LoreView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('.error').text()).toBe('This story has no lorebook.')
  })

  it('rebuilds for a different story, tearing the old graph down first', async () => {
    const { router, fake } = await mountLoaded()

    await router.push({ name: 'lore', params: { id: 'other000000000018' } })
    await flushPromises()

    expect(fake.destroyed).toBe(true)
    expect(loreService.getGraph).toHaveBeenCalledWith('other000000000018')
    expect(FakeGraph.latest).not.toBe(fake)
  })

  it('tears the graph down on unmount', async () => {
    const { wrapper, fake } = await mountLoaded()

    wrapper.unmount()

    expect(fake.destroyed).toBe(true)
  })
})
