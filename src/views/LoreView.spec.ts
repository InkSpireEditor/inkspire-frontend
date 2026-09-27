import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import LoreView from './LoreView.vue'
import { loreService, type LoreGraph, type LoreNode, type LoreEntity } from '../services/lore'
import { filesManagerService } from '../services/filesManager'
import { NODE_REL_SIZE, nodeRadius, relSizeAt } from '../services/loreGraph'

vi.mock('../services/filesManager', () => ({
  filesManagerService: { getDirContent: vi.fn() }
}))

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
    centerAtCalls: unknown[][] = []
    zoomCalls: unknown[][] = []
    reheats = 0
    /** Every graphData() the view has set, so a filter's effect is visible. */
    dataSets: unknown[] = []

    constructor(element: HTMLElement) {
      this.element = element
      FakeGraph.latest = this

      const accessors = [
        'graphData', 'backgroundColor', 'nodeId', 'nodeRelSize', 'nodeVal', 'nodeColor',
        'nodeLabel', 'nodeCanvasObjectMode', 'nodeCanvasObject', 'linkColor', 'linkLabel',
        'linkDirectionalArrowLength', 'linkDirectionalArrowRelPos', 'onEngineStop',
        'onZoom', 'onNodeClick', 'width', 'height'
      ]
      for (const name of accessors) {
        ;(this as unknown as Record<string, unknown>)[name] = (value: unknown) => {
          // Called with nothing, an accessor reads back -- which is how the view
          // re-pokes nodeColor to force a repaint.
          if (value === undefined) return this.config[name]
          this.config[name] = value
          if (name === 'graphData') this.dataSets.push(value)
          return this
        }
      }
    }

    d3ReheatSimulation() {
      this.reheats++
      return this
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

    centerAt(...args: unknown[]) {
      this.centerAtCalls.push(args)
      return this
    }

    zoom(...args: unknown[]) {
      this.zoomCalls.push(args)
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
    routes: [
      { path: '/story/:id', name: 'dashboard', component: { template: '<div />' } },
      { path: '/story/:id/lore', name: 'lore', component: LoreView }
    ]
  })
  await router.push({ name: 'lore', params: { id: storyId } })
  return router
}

/** The last element of an array. `Array.prototype.at` is past this project's TS lib target. */
function last<T>(items: T[]): T {
  return items[items.length - 1]!
}

/** Mounts the view with the graph loaded and force-graph configured. */
async function mountLoaded(graph: LoreGraph = GRAPH_FIXTURE) {
  vi.mocked(loreService.getGraph).mockResolvedValue(graph)
  vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
    id: 'a1b2c3d4e5f60718', name: 'Example Story', summary: 'In one line.', files: []
  })
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

  it("offers a way back to the story's dashboard", async () => {
    const { wrapper, router } = await mountLoaded()

    await wrapper.find('.back-link').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('names the story, which the graph payload itself does not carry', async () => {
    const { wrapper } = await mountLoaded()

    expect(filesManagerService.getDirContent).toHaveBeenCalledWith('stories', 'a1b2c3d4e5f60718')
    expect(wrapper.find('h1').text()).toBe('Example Story')
    expect(wrapper.text()).toContain('In one line.')
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

  describe('node labels', () => {
    const drawing = (fake: InstanceType<typeof FakeGraph>) => {
      const draw = fake.config.nodeCanvasObject as (
        node: LoreNode & { x: number; y: number },
        ctx: unknown,
        scale: number
      ) => void
      const ctx = { font: '', fillStyle: '', textAlign: '', textBaseline: '', fillText: vi.fn() }
      return { draw, ctx }
    }

    it('draws a label just below the circle it names', async () => {
      const { fake } = await mountLoaded()
      const { draw, ctx } = drawing(fake)

      draw({ ...GRAPH_FIXTURE.nodes[0]!, x: 10, y: 20 }, ctx, 1)

      const radius = nodeRadius(1, relSizeAt(1)) // degree 1
      expect(ctx.fillText).toHaveBeenCalledWith('Jane Doe', 10, 20 + radius + 1)
    })

    it('keeps the label at a steady size on screen, whatever the zoom', async () => {
      const { fake } = await mountLoaded()
      const { draw, ctx } = drawing(fake)

      draw({ ...GRAPH_FIXTURE.nodes[0]!, x: 0, y: 0 }, ctx, 4)

      // The canvas is scaled by 4, so 3 graph units render as the usual 12px.
      expect(ctx.font).toBe('3px sans-serif')
    })

    it('still labels a node zoomed well in, which is when the reader most wants the name', async () => {
      const { fake } = await mountLoaded()
      const { draw, ctx } = drawing(fake)

      for (const zoom of [4, 8, 16, 64]) {
        ctx.fillText.mockClear()
        draw({ ...GRAPH_FIXTURE.nodes[0]!, x: 0, y: 0 }, ctx, zoom)
        expect(ctx.fillText, `label missing at ${zoom}x`).toHaveBeenCalled()
      }
    })

    it('drops the label of a node drawn as a speck, which is what clutters an overview', async () => {
      const { fake } = await mountLoaded()
      const { draw, ctx } = drawing(fake)

      // relSizeAt does not damp a zoom under 1, so this is the undamped radius on
      // screen at 0.4x -- below LoreView's own 3px floor for a label.
      const onScreenRadius = nodeRadius(1, relSizeAt(0.4)) * 0.4
      expect(onScreenRadius).toBeLessThan(3)

      draw({ ...GRAPH_FIXTURE.nodes[0]!, x: 0, y: 0 }, ctx, 0.4)

      expect(ctx.fillText).not.toHaveBeenCalled()
    })

    it('labels a search match even when it is drawn that small', async () => {
      const { wrapper, fake } = await mountLoaded()
      await wrapper.find('input[type="search"]').setValue('jane')
      await flushPromises()
      const { draw, ctx } = drawing(fake)

      draw({ ...GRAPH_FIXTURE.nodes[0]!, x: 0, y: 0 }, ctx, 0.4)

      expect(ctx.fillText).toHaveBeenCalled()
    })
  })

  it('says so when a lorebook has no entities yet', async () => {
    const { wrapper } = await mountLoaded({ nodes: [], links: [] })

    expect(wrapper.text()).toContain('This lorebook has no entities yet.')
    expect(FakeGraph.latest).toBeNull()
  })

  it('shows an error when the graph fails to load', async () => {
    vi.mocked(loreService.getGraph).mockRejectedValue(new Error('This story has no lorebook.'))
    vi.mocked(filesManagerService.getDirContent).mockResolvedValue({
      id: 'a1b2c3d4e5f60718', name: 'Example Story', summary: '', files: []
    })
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

  describe('the type legend', () => {
    it('lists every type with its count, coloured to match the nodes', async () => {
      const { wrapper } = await mountLoaded()

      const items = wrapper.findAll('.legend-item')
      expect(items).toHaveLength(2)
      expect(items[0]?.text()).toContain('Character')
      expect(items[0]?.text()).toContain('1')
      expect(items[1]?.text()).toContain('Guild')
      // jsdom resolves an inline hsl() to its rgb() equivalent, so these are
      // hsl(0, 62%, 55%) and hsl(180, 62%, 55%) -- the two hues palette() assigns
      // to Character and Guild -- read back after normalisation.
      expect(items[0]?.find('.swatch').attributes('style')).toBe(
        'background-color: rgb(211, 69, 69);'
      )
      expect(items[1]?.find('.swatch').attributes('style')).toBe(
        'background-color: rgb(69, 211, 211);'
      )
    })

    it("hides a type's nodes, and the links touching them, when its row is clicked", async () => {
      const { wrapper, fake } = await mountLoaded()

      await wrapper.findAll('.legend-item')[1]!.trigger('click')

      const filtered = last(fake.dataSets) as LoreGraph
      expect(filtered.nodes.map((n) => n.label)).toEqual(['Jane Doe'])
      expect(filtered.links).toHaveLength(0)
    })

    it('shows a hidden type again when its row is clicked a second time', async () => {
      const { wrapper, fake } = await mountLoaded()
      const row = () => wrapper.findAll('.legend-item')[1]!

      await row().trigger('click')
      expect(row().classes()).toContain('hidden')

      await row().trigger('click')
      expect(row().classes()).not.toContain('hidden')
      expect((last(fake.dataSets) as LoreGraph).nodes).toHaveLength(2)
    })

    it('hides every type from the heading, then shows them all back', async () => {
      const { wrapper, fake } = await mountLoaded()

      await wrapper.find('.legend h2').trigger('click')
      expect((last(fake.dataSets) as LoreGraph).nodes).toHaveLength(0)

      await wrapper.find('.legend h2').trigger('click')
      expect((last(fake.dataSets) as LoreGraph).nodes).toHaveLength(2)
    })

    it('starts a different story with nothing hidden', async () => {
      const { wrapper, router } = await mountLoaded()
      await wrapper.findAll('.legend-item')[1]!.trigger('click')

      await router.push({ name: 'lore', params: { id: 'other000000000018' } })
      await flushPromises()

      expect(wrapper.findAll('.legend-item.hidden')).toHaveLength(0)
    })
  })

  describe('search', () => {
    it('fades a node the term does not match, and keeps the matches at full colour', async () => {
      const { wrapper, fake } = await mountLoaded()

      await wrapper.find('input[type="search"]').setValue('jane')
      await flushPromises()

      const nodeColor = fake.config.nodeColor as (node: LoreNode) => string
      expect(nodeColor(GRAPH_FIXTURE.nodes[0]!)).toBe('hsl(0, 62%, 55%)')
      expect(nodeColor(GRAPH_FIXTURE.nodes[1]!)).toBe('hsla(180, 62%, 55%, 0.12)')
    })

    it('frames what it matched', async () => {
      const { wrapper, fake } = await mountLoaded()
      const before = fake.zoomToFitCalls.length

      await wrapper.find('input[type="search"]').setValue('guild')
      await flushPromises()

      expect(fake.zoomToFitCalls.length).toBe(before + 1)
      const filter = last(fake.zoomToFitCalls)[2] as (node: LoreNode) => boolean
      expect(filter(GRAPH_FIXTURE.nodes[1]!)).toBe(true)
      expect(filter(GRAPH_FIXTURE.nodes[0]!)).toBe(false)
    })

    it('leaves every node at full colour once the term is cleared', async () => {
      const { wrapper, fake } = await mountLoaded()
      await wrapper.find('input[type="search"]').setValue('jane')
      await flushPromises()

      await wrapper.find('input[type="search"]').setValue('')
      await flushPromises()

      const nodeColor = fake.config.nodeColor as (node: LoreNode) => string
      expect(nodeColor(GRAPH_FIXTURE.nodes[1]!)).toBe('hsl(180, 62%, 55%)')
    })

    it('does not re-run the layout, since only emphasis changed', async () => {
      const { wrapper, fake } = await mountLoaded()
      const before = fake.reheats

      await wrapper.find('input[type="search"]').setValue('jane')
      await flushPromises()

      expect(fake.reheats).toBe(before)
    })

    it('drops the label of a node the search did not match', async () => {
      const { wrapper, fake } = await mountLoaded()
      await wrapper.find('input[type="search"]').setValue('jane')
      await flushPromises()

      const draw = fake.config.nodeCanvasObject as (
        node: LoreNode & { x: number; y: number },
        ctx: unknown,
        scale: number
      ) => void
      const ctx = { font: '', fillStyle: '', textAlign: '', textBaseline: '', fillText: vi.fn() }

      draw({ ...GRAPH_FIXTURE.nodes[1]!, x: 0, y: 0 }, ctx, 1)
      expect(ctx.fillText).not.toHaveBeenCalled()

      draw({ ...GRAPH_FIXTURE.nodes[0]!, x: 0, y: 0 }, ctx, 1)
      expect(ctx.fillText).toHaveBeenCalled()
    })
  })

  describe('node size against zoom', () => {
    it('starts at the undamped base size', async () => {
      const { fake } = await mountLoaded()

      expect(fake.config.nodeRelSize).toBe(NODE_REL_SIZE)
    })

    it('shrinks the base size as the reader zooms in, so a dot cannot swallow its label', async () => {
      const { fake } = await mountLoaded()
      const onZoom = fake.config.onZoom as (t: { k: number; x: number; y: number }) => void

      onZoom({ k: 4, x: 0, y: 0 })

      expect(fake.config.nodeRelSize).toBeCloseTo(relSizeAt(4), 6)
      // Whatever the tuned damping, zooming in must never grow a node past its
      // undamped size -- that would mean it grows *faster* than the zoom itself.
      expect(fake.config.nodeRelSize as number).toBeLessThanOrEqual(NODE_REL_SIZE)
    })

    it('leaves the base size alone when zoomed out, where specks are what an overview wants', async () => {
      const { fake } = await mountLoaded()
      const onZoom = fake.config.onZoom as (t: { k: number; x: number; y: number }) => void

      onZoom({ k: 0.25, x: 0, y: 0 })

      expect(fake.config.nodeRelSize).toBe(NODE_REL_SIZE)
    })

    it('keeps a label hugging the circle it labels, at whatever size that circle is drawn', async () => {
      const { fake } = await mountLoaded()
      const draw = fake.config.nodeCanvasObject as (
        node: LoreNode & { x: number; y: number },
        ctx: unknown,
        scale: number
      ) => void
      const ctx = { font: '', fillStyle: '', textAlign: '', textBaseline: '', fillText: vi.fn() }
      const node = { ...GRAPH_FIXTURE.nodes[0]!, x: 0, y: 0 }

      draw(node, ctx, 2)

      const expected = nodeRadius(node.degree, relSizeAt(2)) + 1
      expect(ctx.fillText).toHaveBeenCalledWith('Jane Doe', 0, expected)
    })
  })

  describe('the spacing slider', () => {
    it('starts at the same default the CLI page uses', async () => {
      const { wrapper, fake } = await mountLoaded()

      expect((wrapper.find('input[type="range"]').element as HTMLInputElement).value).toBe('1.6')
      expect(fake.fakeForces.link?.distance).toHaveBeenCalledWith(34 * 1.6)
    })

    it('scales link distance and charge strength together, then reheats', async () => {
      const { wrapper, fake } = await mountLoaded()
      const reheatsBefore = fake.reheats

      await wrapper.find('input[type="range"]').setValue('3')
      await flushPromises()

      expect(fake.fakeForces.link?.distance).toHaveBeenLastCalledWith(34 * 3)
      expect(fake.fakeForces.charge?.strength).toHaveBeenLastCalledWith(-55 * 3)
      expect(fake.fakeForces.charge?.distanceMax).toHaveBeenLastCalledWith(800)
      // The simulation has settled by now, so new distances need a reheat to take.
      expect(fake.reheats).toBe(reheatsBefore + 1)
    })

    it('reframes once the layout settles at its new spacing', async () => {
      const { wrapper, fake } = await mountLoaded()
      const onEngineStop = fake.config.onEngineStop as () => void
      onEngineStop()
      const framedBefore = fake.zoomToFitCalls.length

      await wrapper.find('input[type="range"]').setValue('3')
      await flushPromises()
      onEngineStop()

      expect(fake.zoomToFitCalls.length).toBe(framedBefore + 1)
    })
  })

  describe('the entity panel', () => {
    const ENTITY_FIXTURE: LoreEntity = {
      id: 'https://example.test/entity#Doe',
      local: 'Doe',
      types: ['Entity', 'Character'],
      aka: ['Janie'],
      sections: { personality: 'Steady.', backstory: 'From elsewhere.' },
      name: 'Jane Doe',
      age: '32',
      occupation: null,
      memberOf: ['Example Guild'],
      mentorOf: []
    }

    function clickNode(fake: InstanceType<typeof FakeGraph>, node: unknown = { ...GRAPH_FIXTURE.nodes[0]!, x: 10, y: 20 }) {
      const onNodeClick = fake.config.onNodeClick as (node: unknown) => void
      onNodeClick(node)
    }

    it('moves the camera to the clicked node, same as the CLI page always has', async () => {
      const { fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockResolvedValue(ENTITY_FIXTURE)

      clickNode(fake)

      expect(fake.centerAtCalls[0]).toEqual([10, 20, 500])
      expect(fake.zoomCalls[0]).toEqual([4, 500])
    })

    it('opens the panel with a loading state, then the fetched entity', async () => {
      const { wrapper, fake } = await mountLoaded()
      let resolveEntity!: (entity: LoreEntity) => void
      vi.mocked(loreService.getEntity).mockReturnValue(
        new Promise((resolve) => { resolveEntity = resolve })
      )

      clickNode(fake)
      await flushPromises()
      expect(wrapper.find('.side-panel').text()).toContain('Loading')

      resolveEntity(ENTITY_FIXTURE)
      await flushPromises()

      expect(loreService.getEntity).toHaveBeenCalledWith('a1b2c3d4e5f60718', 'Doe')
      expect(wrapper.find('.entity-name').text()).toBe('Jane Doe')
      expect(wrapper.find('.entity-types').text()).toBe('Entity, Character')
    })

    it('shows a populated scalar field but skips one left null', async () => {
      const { wrapper, fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockResolvedValue(ENTITY_FIXTURE)

      clickNode(fake)
      await flushPromises()

      expect(wrapper.text()).toContain('age')
      expect(wrapper.text()).toContain('32')
      expect(wrapper.text()).not.toContain('occupation')
    })

    it('shows a non-empty relation as plain text but skips an empty one', async () => {
      const { wrapper, fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockResolvedValue(ENTITY_FIXTURE)

      clickNode(fake)
      await flushPromises()

      expect(wrapper.text()).toContain('memberOf')
      expect(wrapper.text()).toContain('Example Guild')
      expect(wrapper.text()).not.toContain('mentorOf')
    })

    it("names the entity's nicknames", async () => {
      const { wrapper, fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockResolvedValue(ENTITY_FIXTURE)

      clickNode(fake)
      await flushPromises()

      expect(wrapper.text()).toContain('Also known as Janie')
    })

    it("renders the character layout's prose sections, in that layout's own order", async () => {
      const { wrapper, fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockResolvedValue(ENTITY_FIXTURE)

      clickNode(fake)
      await flushPromises()

      const headings = wrapper.findAll('h4').map((h) => h.text())
      expect(headings).toEqual(['Personality and Traits', 'Backstory'])
      expect(wrapper.text()).toContain('Steady.')
      expect(wrapper.text()).toContain('From elsewhere.')
    })

    it('shows an error in the panel when the entity fails to load', async () => {
      const { wrapper, fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockRejectedValue(new Error('Nothing in this lorebook is called "Doe".'))

      clickNode(fake)
      await flushPromises()

      expect(wrapper.find('.side-panel .error').text()).toBe('Nothing in this lorebook is called "Doe".')
    })

    it('closes the panel, clearing what it showed and sliding it back out', async () => {
      const { wrapper, fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockResolvedValue(ENTITY_FIXTURE)
      clickNode(fake)
      await flushPromises()

      await wrapper.find('.side-panel button.close').trigger('click')

      // Stays mounted -- it is what lets it slide shut rather than vanish --
      // but is marked collapsed and no longer carries the entity's own text.
      expect(wrapper.find('.side-panel').classes()).toContain('collapsed')
      expect(wrapper.text()).not.toContain('Jane Doe')
    })

    it('closes a stale panel when the story changes', async () => {
      const { wrapper, router, fake } = await mountLoaded()
      vi.mocked(loreService.getEntity).mockResolvedValue(ENTITY_FIXTURE)
      clickNode(fake)
      await flushPromises()
      expect(wrapper.find('.side-panel').classes()).not.toContain('collapsed')

      await router.push({ name: 'lore', params: { id: 'other000000000018' } })
      await flushPromises()

      expect(wrapper.find('.side-panel').classes()).toContain('collapsed')
    })

    it('starts collapsed, with nothing yet selected', async () => {
      const { wrapper } = await mountLoaded()

      expect(wrapper.find('.side-panel').classes()).toContain('collapsed')
    })
  })

  it('tears the graph down on unmount', async () => {
    const { wrapper, fake } = await mountLoaded()

    wrapper.unmount()

    expect(fake.destroyed).toBe(true)
  })
})
