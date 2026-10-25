<script setup lang="ts">
/**
 * Horizontal bars for one series, with a table twin. One series is one colour, the app's
 * accent: a bar's length carries the value, so a ramp on top of it would say nothing more.
 * Every bar is labelled at its tip, and the same numbers are in the table, so nothing depends
 * on a tooltip or on colour. A row takes keyboard focus and shows the same tooltip as hover.
 */
import { computed, ref } from 'vue'
import type { Bar } from '../services/homeStats'

const props = defineProps<{
  title: string
  /** What the values count, in the plural: "words", "chapters". */
  unit: string
  bars: Bar[]
  /** A line under the title, such as a total. */
  caption?: string
}>()

const view = ref<'chart' | 'table'>('chart')

const numbers = new Intl.NumberFormat()
const format = (value: number): string => numbers.format(value)

const largest = computed(() => Math.max(0, ...props.bars.map((bar) => bar.value)))
/** A bar's length as a fraction of the longest one's. */
const share = (bar: Bar): number => (largest.value > 0 ? bar.value / largest.value : 0)

const hasDetail = computed(() => props.bars.some((bar) => bar.detail))
const heading = computed(() => props.unit.charAt(0).toUpperCase() + props.unit.slice(1))
const spoken = (bar: Bar): string =>
  `${bar.label}: ${format(bar.value)} ${props.unit}${bar.detail ? `, ${bar.detail}` : ''}`
</script>

<template>
  <section class="bar-chart">
    <header>
      <h2>{{ title }}</h2>
      <button
        class="view-toggle"
        type="button"
        :aria-pressed="view === 'table'"
        @click="view = view === 'chart' ? 'table' : 'chart'"
      >
        {{ view === 'chart' ? 'Table' : 'Chart' }}
      </button>
    </header>
    <p v-if="caption" class="caption">{{ caption }}</p>

    <ul v-if="view === 'chart'" class="bars">
      <li v-for="bar in bars" :key="bar.label" class="row" tabindex="0" :aria-label="spoken(bar)">
        <span class="label" :title="bar.label">{{ bar.label }}</span>
        <span class="track">
          <span class="bar" :class="{ empty: bar.value === 0 }" :style="{ '--share': share(bar) }"></span>
          <span class="value">{{ format(bar.value) }}</span>
        </span>
        <span class="tip" role="tooltip">
          <strong>{{ format(bar.value) }} {{ unit }}</strong>
          <span>{{ bar.label }}</span>
          <span v-if="bar.detail">{{ bar.detail }}</span>
        </span>
      </li>
    </ul>

    <table v-else class="table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th v-if="hasDetail" scope="col"></th>
          <th scope="col" class="number">{{ heading }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="bar in bars" :key="bar.label">
          <th scope="row">{{ bar.label }}</th>
          <td v-if="hasDetail" class="detail">{{ bar.detail }}</td>
          <td class="number">{{ format(bar.value) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.bar-chart {
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

.bars {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  border-radius: var(--radius-sm);
}

.row:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.label {
  flex: none;
  width: 9rem;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The baseline the bars grow from. */
.track {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-1) 0;
  border-left: 1px solid var(--color-border);
}

/* Up to 5rem is left for the value after the longest bar. Thin, with a rounded data end
   and a square baseline. */
.bar {
  flex: none;
  width: calc((100% - 5rem) * var(--share));
  min-width: 2px;
  height: 14px;
  background: var(--color-primary);
  border-radius: 0 4px 4px 0;
}

.bar.empty {
  min-width: 0;
}

.row:hover .bar,
.row:focus-visible .bar {
  background: var(--color-primary-hover);
}

.value {
  color: var(--color-text);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.tip {
  position: absolute;
  bottom: 100%;
  left: 9.75rem;
  z-index: 1;
  display: none;
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

.row:hover .tip,
.row:focus-visible .tip {
  display: flex;
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

.table .detail {
  color: var(--color-text-muted);
}

.table .number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
