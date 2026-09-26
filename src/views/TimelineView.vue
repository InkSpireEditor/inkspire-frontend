<script setup lang="ts">
/**
 * A story's timeline, laid out entirely server-side and drawn here as SVG.
 *
 * Every event's box, and the whole canvas height, arrive already computed
 * (`timeline.process()`); this view only converts layout units to pixels and draws
 * what it is given -- it lays nothing out itself. X packs events in date order, not
 * proportional to elapsed time, and `date` is a display string already formatted
 * through that event's own `dateStyle` -- there is no ISO date to recover a true
 * scale from, which is why the caption below says "chronological order" rather
 * than something more precise than the data supports.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { timelineService, type TimelineResponse } from '../services/timeline'

const route = useRoute()
const data = ref<TimelineResponse | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

/** 1 layout unit ≈ this many px on screen. Typst renders the same units at 1cm each. */
const PX_PER_UNIT = 48
/** Half of widthStep, widening an arc's bracket a little past its two endpoints. */
const ARC_X_PADDING_UNITS = 0.5
/** Gap between an arc's row and the top of its two vertical guide lines. */
const ARC_Y_PADDING_UNITS = 1
/** How far an arc's curve bulges below its row -- ported from the Typst template's own d=5. */
const ARC_SAG_UNITS = 5

const load = async () => {
  const id = route.params.id
  if (typeof id !== 'string') return

  loading.value = true
  error.value = null
  try {
    data.value = await timelineService.get(id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the timeline'
  } finally {
    loading.value = false
  }
}

onMounted(load)
// A timeline link elsewhere can be clicked while this view is already open, which
// changes the param without remounting the component.
watch(() => route.params.id, load)

const eventsByKey = computed(() => new Map((data.value?.events ?? []).map((e) => [e.key, e])))

const svgWidthPx = computed(() => {
  if (!data.value || data.value.events.length === 0) return 0
  const maxWidthUnits = Math.max(...data.value.events.map((e) => e.x2)) + data.value.widthStep
  return maxWidthUnits * PX_PER_UNIT
})

const svgHeightPx = computed(() => (data.value ? data.value.maxHeight * PX_PER_UNIT : 0))

interface ThreadSegment {
  color: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * One line per consecutive pair of a character's events, connecting box centres.
 * Drawn before the event boxes so the boxes sit on top -- the same two-layer
 * z-order the Typst template uses (threads on layer 0, boxes on layer 1).
 */
const threads = computed<ThreadSegment[]>(() => {
  if (!data.value) return []
  return data.value.characters.flatMap((character) =>
    character.events.slice(0, -1).map((key, i) => {
      const from = eventsByKey.value.get(key)!
      const to = eventsByKey.value.get(character.events[i + 1]!)!
      return {
        color: character.color,
        x1: ((from.x1 + from.x2) / 2) * PX_PER_UNIT,
        y1: ((from.y1 + from.y2) / 2) * PX_PER_UNIT,
        x2: ((to.x1 + to.x2) / 2) * PX_PER_UNIT,
        y2: ((to.y1 + to.y2) / 2) * PX_PER_UNIT,
      }
    })
  )
})

interface ArcBracket {
  name: string
  x1: number
  x2: number
  rowY: number
  topY: number
  curveY: number
}

const arcs = computed<ArcBracket[]>(() => {
  if (!data.value) return []
  const maxHeight = data.value.maxHeight
  return data.value.arcs.map((arc) => {
    const first = eventsByKey.value.get(arc.firstEvent)!
    const last = eventsByKey.value.get(arc.lastEvent)!
    const x1 = (first.x1 - ARC_X_PADDING_UNITS) * PX_PER_UNIT
    const x2 = (last.x2 + ARC_X_PADDING_UNITS) * PX_PER_UNIT
    const rowY = (maxHeight - 1) * PX_PER_UNIT
    const topY = rowY - ARC_Y_PADDING_UNITS * PX_PER_UNIT
    const curveY = rowY + ARC_SAG_UNITS * PX_PER_UNIT
    return { name: arc.name, x1, x2, rowY, topY, curveY }
  })
})

interface EventBox {
  key: string
  date: string
  description: string
  href: string
  x: number
  y: number
  width: number
  height: number
}

const eventBoxes = computed<EventBox[]>(() =>
  (data.value?.events ?? []).map((e) => ({
    key: e.key,
    date: e.date,
    description: e.description,
    href: e.href,
    x: e.x1 * PX_PER_UNIT,
    y: e.y1 * PX_PER_UNIT,
    width: (e.x2 - e.x1) * PX_PER_UNIT,
    height: (e.y2 - e.y1) * PX_PER_UNIT,
  }))
)
</script>

<template>
  <div class="timeline-view">
    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <template v-else-if="data">
      <h1>{{ data.title }}</h1>
      <p v-if="data.events.length === 0" class="empty">No events yet.</p>
      <template v-else>
        <ul class="legend">
          <li v-for="character in data.characters" :key="character.key">
            <span class="swatch" :style="{ backgroundColor: character.color }"></span>
            {{ character.name }}
          </li>
        </ul>

        <p class="caption">
          Events are shown in chronological order — spacing does not represent elapsed time.
        </p>

        <div class="timeline-scroll">
          <svg :width="svgWidthPx" :height="svgHeightPx">
            <g class="threads">
              <line
                v-for="(thread, i) in threads"
                :key="i"
                :x1="thread.x1"
                :y1="thread.y1"
                :x2="thread.x2"
                :y2="thread.y2"
                :stroke="thread.color"
              />
            </g>

            <g class="arcs">
              <template v-for="arc in arcs" :key="arc.name">
                <line class="arc-guide" :x1="arc.x1" :y1="arc.topY" :x2="arc.x1" :y2="arc.rowY" />
                <line class="arc-guide" :x1="arc.x2" :y1="arc.topY" :x2="arc.x2" :y2="arc.rowY" />
                <path
                  class="arc-curve"
                  :d="`M ${arc.x1} ${arc.rowY} Q ${(arc.x1 + arc.x2) / 2} ${arc.curveY} ${arc.x2} ${arc.rowY}`"
                />
                <text class="arc-label" :x="(arc.x1 + arc.x2) / 2" :y="arc.rowY + (arc.curveY - arc.rowY) / 2.5">
                  {{ arc.name }}
                </text>
              </template>
            </g>

            <g class="events">
              <g v-for="box in eventBoxes" :key="box.key" :transform="`translate(${box.x}, ${box.y})`">
                <rect class="event-box" :width="box.width" :height="box.height" rx="4" />
                <text class="event-date" :x="box.width / 2" :y="box.height / 3">{{ box.date }}</text>
                <a v-if="box.href" :href="box.href" target="_blank" rel="noopener">
                  <text class="event-description event-link" :x="box.width / 2" :y="(box.height * 2) / 3">
                    {{ box.description }}
                  </text>
                </a>
                <text v-else class="event-description" :x="box.width / 2" :y="(box.height * 2) / 3">
                  {{ box.description }}
                </text>
              </g>
            </g>
          </svg>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.timeline-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h1 {
  color: var(--color-heading);
  font-weight: var(--font-weight-bold);
}

.error {
  color: var(--color-danger);
}

.empty {
  color: var(--color-text);
  opacity: 0.7;
}

.legend {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  padding: 0;
  margin: 0;
}

.legend li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
}

.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.caption {
  color: var(--color-text);
  opacity: 0.7;
  font-size: 0.85rem;
  margin: 0;
}

.timeline-scroll {
  overflow-x: auto;
  flex: 1;
  min-height: 0;
}

.event-box {
  fill: var(--color-background-soft);
  stroke: var(--color-border);
}

.event-date {
  fill: var(--color-text);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-anchor: middle;
}

.event-description {
  fill: var(--color-heading);
  font-size: 13px;
  text-anchor: middle;
}

.event-link {
  fill: var(--color-primary);
  text-decoration: underline;
}

.arc-guide {
  stroke: var(--color-border);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
}

.arc-curve {
  fill: none;
  stroke: var(--color-border);
  stroke-width: 1.5;
}

.arc-label {
  fill: var(--color-heading);
  font-size: 11px;
  font-weight: var(--font-weight-bold);
  text-anchor: middle;
}
</style>
