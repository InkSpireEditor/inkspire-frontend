<script setup lang="ts">
/**
 * The words written per day as a grid of 52 weeks by 7 days, Monday first, laid out by
 * `services/activityGrid.ts`. Empty days are one step and days with words are four steps of
 * the accent colour, the steps taken from the year's own distribution, so one very large day
 * does not flatten the rest. Hover shows one tooltip for the cell under the pointer, and the
 * table twin lists the days that have words, so nothing depends on colour or on a pointer.
 *
 * The tooltip is a sibling of the scrolling element, not inside it: inside, the top rows'
 * tooltips would be cut off by the scroll container.
 */
import { computed, ref } from 'vue'
import { buildGrid, longDate, monthLabels, summarise } from '../services/activityGrid'
import type { ActivityDay } from '../services/activity'

const props = defineProps<{
  days: ActivityDay[]
  today: string
}>()

const view = ref<'grid' | 'table'>('grid')

const numbers = new Intl.NumberFormat()
const format = (value: number): string => numbers.format(value)

const grid = computed(() => buildGrid(props.days, props.today))
const labels = computed(() => monthLabels(grid.value.columns))
const summary = computed(() => summarise(grid.value))

const caption = computed(() =>
  summary.value.total > 0
    ? `${format(summary.value.total)} words in the last year`
    : 'Nothing written in the last year'
)

const spoken = computed(() => {
  const { total, busiest } = summary.value
  const busiestSentence = busiest
    ? ` The busiest day was ${longDate(busiest.date)}, with ${format(busiest.words)} words.`
    : ''
  return `Words written: ${format(total)} in the last year.${busiestSentence}`
})

/** The days of the grid that have words, newest first: the table twin's rows. */
const tableDays = computed(() =>
  grid.value.columns
    .flat()
    .filter((cell) => !cell.future && cell.words > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
)

/** The names beside the rows: every other row, so they do not crowd each other. */
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']

/** What the pointer is over, as one tooltip moved across the grid. */
const hovered = ref<{ date: string; words: number } | null>(null)
const tipPosition = ref({ left: 0, top: 0 })
const stage = ref<HTMLElement | null>(null)

/** Half a tooltip's width, kept clear of the stage's edges so it is not cut off. */
const TIP_MARGIN = 80

const onPointerOver = (event: PointerEvent) => {
  const cell = (event.target as HTMLElement).closest('[data-date]')
  if (!cell || !stage.value) {
    hovered.value = null
    return
  }
  hovered.value = {
    date: cell.getAttribute('data-date')!,
    words: Number(cell.getAttribute('data-words'))
  }
  const stageBox = stage.value.getBoundingClientRect()
  const cellBox = cell.getBoundingClientRect()
  const centre = cellBox.left - stageBox.left + cellBox.width / 2
  tipPosition.value = {
    left: Math.min(Math.max(centre, TIP_MARGIN), Math.max(TIP_MARGIN, stageBox.width - TIP_MARGIN)),
    top: cellBox.top - stageBox.top
  }
}

const onPointerLeave = () => {
  hovered.value = null
}
</script>

<template>
  <section class="activity">
    <header>
      <h2>Words written</h2>
      <button
        class="view-toggle"
        type="button"
        :aria-pressed="view === 'table'"
        @click="view = view === 'grid' ? 'table' : 'grid'"
      >
        {{ view === 'grid' ? 'Table' : 'Grid' }}
      </button>
    </header>
    <p class="caption">{{ caption }}</p>

    <div v-if="view === 'grid'" ref="stage" class="stage">
      <div class="scroller">
        <div class="chart">
          <div class="months" aria-hidden="true">
            <span v-for="(label, index) in labels" :key="index" class="month">{{ label ?? '' }}</span>
          </div>
          <div class="weekdays" aria-hidden="true">
            <span v-for="(name, row) in WEEKDAY_LABELS" :key="row">{{ name }}</span>
          </div>
          <div
            class="grid"
            role="img"
            :aria-label="spoken"
            @pointerover="onPointerOver"
            @pointerleave="onPointerLeave"
          >
            <div v-for="(column, week) in grid.columns" :key="week" class="column">
              <template v-for="cell in column" :key="cell.date">
                <span
                  v-if="!cell.future"
                  class="cell"
                  :class="`level-${cell.level}`"
                  :data-date="cell.date"
                  :data-words="cell.words"
                  aria-hidden="true"
                ></span>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="hovered"
        class="tip"
        role="tooltip"
        :style="{ left: `${tipPosition.left}px`, top: `${tipPosition.top}px` }"
      >
        <strong v-if="hovered.words > 0">{{ format(hovered.words) }} words</strong>
        <span v-else>No words</span>
        <span>{{ longDate(hovered.date) }}</span>
      </div>
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col" class="number">Words</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in tableDays" :key="entry.date">
          <th scope="row">{{ longDate(entry.date) }}</th>
          <td class="number">{{ format(entry.words) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="view === 'table' && tableDays.length === 0" class="empty">Nothing written.</p>
  </section>
</template>

<style scoped>
.activity {
  margin-bottom: var(--space-5);
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

h2 {
  color: var(--color-text);
  font-size: 1rem;
  font-weight: var(--font-weight-bold);
}

.caption {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin-bottom: var(--space-2);
}

.view-toggle {
  padding: 0 var(--space-2);
  background: none;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.view-toggle:hover {
  border-color: var(--color-border-hover);
}

.view-toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.stage {
  position: relative;
}

.scroller {
  overflow-x: auto;
}

/* The month names, the weekday names and the grid share one two-by-two layout, so a name
   sits over its weeks and beside its rows whatever the width. */
.chart {
  display: grid;
  grid-template-columns: 2.5rem auto;
  width: fit-content;
  row-gap: 4px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.months {
  grid-column: 2;
  display: flex;
  gap: 3px;
}

/* One 10px slot per column; a name is wider than its slot and overflows into the empty ones. */
.month {
  flex: none;
  width: 10px;
  white-space: nowrap;
}

.weekdays {
  grid-column: 1;
  display: grid;
  grid-template-rows: repeat(7, 10px);
  gap: 3px;
}

.weekdays span {
  line-height: 10px;
}

.grid {
  grid-column: 2;
  display: flex;
  gap: 3px;
}

.column {
  display: grid;
  grid-template-rows: repeat(7, 10px);
  gap: 3px;
  width: 10px;
}

.cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--color-background-mute);
}

.cell.level-1 {
  background: color-mix(in srgb, var(--color-primary) 25%, var(--color-background-soft));
}

.cell.level-2 {
  background: color-mix(in srgb, var(--color-primary) 50%, var(--color-background-soft));
}

.cell.level-3 {
  background: color-mix(in srgb, var(--color-primary) 75%, var(--color-background-soft));
}

.cell.level-4 {
  background: var(--color-primary);
}

.tip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 6px));
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: var(--space-2) var(--space-3);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-strong);
  font-size: 0.85rem;
  white-space: nowrap;
  pointer-events: none;
}

.tip strong {
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
}

.tip span {
  color: var(--color-text-muted);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.table th,
.table td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  text-align: left;
  font-weight: normal;
}

.table thead th {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.table .number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.empty {
  color: var(--color-text-muted);
}
</style>
