# Colours

Every colour the interface uses, as a swatch, with what reads it. The tokens are defined in
`src/assets/base.css`; the dark theme redefines some of them under `body.dark-theme`.
`src/assets/colors.spec.ts` fails if a colour token or swatch here disagrees with `base.css`,
so edit both together.

"Used by" lists the files that read the token with `var(...)`. It does not list the other
tokens in `base.css` that read it: `--focus-ring` reads `--color-primary-soft`.

## Base colours

Named by lightness in percent: `--ink-c-grey-88` is 88% light, `--ink-c-blue-48` is 48% light. A
new step goes between two others without renaming them. Components do not read these; the
semantic tokens below do.

| Token | Swatch | Value | Read by |
|---|---|---|---|
| `--ink-c-grey-100` | ![](colors/ink-c-grey-100.svg) | `#ffffff` | `--color-background-soft`, `--color-text-on-fill` |
| `--ink-c-grey-96` | ![](colors/ink-c-grey-96.svg) | `#f5f5f5` | `--color-background` |
| `--ink-c-grey-93` | ![](colors/ink-c-grey-93.svg) | `#ececec` | `--color-panel` |
| `--ink-c-grey-89` | ![](colors/ink-c-grey-89.svg) | `#e4e4e4` | `--color-background-mute` |
| `--ink-c-grey-88` | ![](colors/ink-c-grey-88.svg) | `#e0e0e0` | `--color-border`, `--color-divider`, `--color-text` |
| `--ink-c-grey-74` | ![](colors/ink-c-grey-74.svg) | `#bdbdbd` | `--color-border-hover` |
| `--ink-c-grey-62` | ![](colors/ink-c-grey-62.svg) | `#9e9e9e` | `--color-text-faint`, `--color-text-muted` |
| `--ink-c-grey-40` | ![](colors/ink-c-grey-40.svg) | `#666666` | `--color-text-faint`, `--color-text-muted` |
| `--ink-c-grey-33` | ![](colors/ink-c-grey-33.svg) | `#555555` | `--color-border-hover` |
| `--ink-c-grey-26` | ![](colors/ink-c-grey-26.svg) | `#424242` | `--color-border` |
| `--ink-c-grey-16` | ![](colors/ink-c-grey-16.svg) | `#2a2a2a` | `--color-background-mute`, `--color-divider` |
| `--ink-c-grey-13` | ![](colors/ink-c-grey-13.svg) | `#212121` | `--color-text` |
| `--ink-c-grey-12` | ![](colors/ink-c-grey-12.svg) | `#1e1e1e` | `--color-background-soft` |
| `--ink-c-grey-10` | ![](colors/ink-c-grey-10.svg) | `#1a1a1a` | `--color-panel` |
| `--ink-c-grey-7` | ![](colors/ink-c-grey-7.svg) | `#121212` | `--color-background` |
| `--ink-c-blue-54` | ![](colors/ink-c-blue-54.svg) | `#2196f3` | `--color-primary`, `--color-primary-hover` |
| `--ink-c-blue-48` | ![](colors/ink-c-blue-48.svg) | `#1186e3` | `--color-primary` |
| `--ink-c-blue-46` | ![](colors/ink-c-blue-46.svg) | `#1976d2` | `--color-primary-hover` |
| `--ink-c-red` | ![](colors/ink-c-red.svg) | `#f44336` | `--color-danger` |

## Semantic tokens

What components read. Each one is a base colour or a literal value, per theme.

| Token | Light | Dark | Used by |
|---|---|---|---|
| `--color-background` | ![](colors/color-background-light.svg) `#f5f5f5` | ![](colors/color-background-dark.svg) `#121212` | App.vue, Login.vue, MarkdownEditor.vue, Modal.vue, Tree.vue, TreeItem.vue |
| `--color-background-soft` | ![](colors/color-background-soft-light.svg) `#ffffff` | ![](colors/color-background-soft-dark.svg) `#1e1e1e` | BarChart.vue, DashboardView.vue, GenerationInstruction.vue, GenerationSettings.vue, GitPanel.vue, HomeView.vue, Login.vue, LoreView.vue, Modal.vue, ModelSelector.vue, Text.vue, TimelineView.vue, Tree.vue |
| `--color-background-mute` | ![](colors/color-background-mute-light.svg) `#e4e4e4` | ![](colors/color-background-mute-dark.svg) `#2a2a2a` | App.vue, DashboardView.vue, GitPanel.vue, Modal.vue, Text.vue, TimelineView.vue, Tree.vue, TreeItem.vue |
| `--color-panel` | ![](colors/color-panel-light.svg) `#ececec` | ![](colors/color-panel-dark.svg) `#1a1a1a` | App.vue, ModelSelector.vue, SidePanel.vue, Tree.vue |
| `--color-border` | ![](colors/color-border-light.svg) `#e0e0e0` | ![](colors/color-border-dark.svg) `#424242` | BarChart.vue, DashboardView.vue, GenerationInstruction.vue, GenerationSettings.vue, GitPanel.vue, HomeView.vue, Login.vue, LoreView.vue, Modal.vue, ModelSelector.vue, ReadingView.vue, Text.vue, TimelineView.vue, Tree.vue, TreeItem.vue |
| `--color-border-hover` | ![](colors/color-border-hover-light.svg) `#bdbdbd` | ![](colors/color-border-hover-dark.svg) `#555555` | BarChart.vue, DashboardView.vue, GenerationSettings.vue, ModelSelector.vue, Text.vue, Tree.vue |
| `--color-divider` | ![](colors/color-divider-light.svg) `#e0e0e0` | ![](colors/color-divider-dark.svg) `#2a2a2a` | App.vue, ModelSelector.vue, SidePanel.vue, Tree.vue |
| `--color-text` | ![](colors/color-text-light.svg) `#212121` | ![](colors/color-text-dark.svg) `#e0e0e0` | App.vue, BackLink.vue, BarChart.vue, DashboardView.vue, GenerationInstruction.vue, GenerationSettings.vue, GitPanel.vue, HomeView.vue, Login.vue, LoreView.vue, MarkdownEditor.vue, Modal.vue, ModelSelector.vue, ReadingView.vue, RenderedProse.vue, SidePanel.vue, Text.vue, TimelineView.vue, Tree.vue, TreeItem.vue |
| `--color-primary` | ![](colors/color-primary-light.svg) `#2196f3` | ![](colors/color-primary-dark.svg) `#1186e3` | BarChart.vue, DashboardView.vue, HomeView.vue, Login.vue, Modal.vue, ModelSelector.vue, Text.vue, TimelineView.vue, Tree.vue, TreeItem.vue, main.css |
| `--color-primary-hover` | ![](colors/color-primary-hover-light.svg) `#1976d2` | ![](colors/color-primary-hover-dark.svg) `#2196f3` | BarChart.vue, Login.vue, Modal.vue, Text.vue |
| `--color-primary-soft` | ![](colors/color-primary-soft-light.svg) `rgba(33, 150, 243, 0.1)` | ![](colors/color-primary-soft-dark.svg) `rgba(17, 134, 227, 0.2)` | Text.vue, TreeItem.vue, main.css |
| `--color-danger` | ![](colors/color-danger-light.svg) `#f44336` | ![](colors/color-danger-dark.svg) `#f44336` | DashboardView.vue, GenerationSettings.vue, GitPanel.vue, HomeView.vue, Login.vue, LoreView.vue, Modal.vue, ModelSelector.vue, ReadingView.vue, TimelineView.vue |
| `--color-text-muted` | ![](colors/color-text-muted-light.svg) `#666666` | ![](colors/color-text-muted-dark.svg) `#9e9e9e` | BackLink.vue, BarChart.vue, DashboardView.vue, GenerationInstruction.vue, GenerationSettings.vue, HomeView.vue, LoreView.vue, ReadingView.vue, SidePanel.vue, TimelineView.vue |
| `--color-text-faint` | ![](colors/color-text-faint-light.svg) `#9e9e9e` | ![](colors/color-text-faint-dark.svg) `#666666` | MarkdownEditor.vue, Text.vue |
| `--color-text-on-fill` | ![](colors/color-text-on-fill-light.svg) `#ffffff` | ![](colors/color-text-on-fill-dark.svg) `#ffffff` | DashboardView.vue, Login.vue, Modal.vue, Text.vue |
| `--color-backdrop` | ![](colors/color-backdrop-light.svg) `rgba(0, 0, 0, 0.5)` | ![](colors/color-backdrop-dark.svg) `rgba(0, 0, 0, 0.5)` | Modal.vue |

## Colours outside `base.css`

| Where | Value | What it is |
|---|---|---|
| `components/MarkdownEditor.vue`, `::highlight(ink-gen)` | `rgba(111, 209, 139, 0.22)` | Tint behind text a model wrote |
| `components/MarkdownEditor.vue`, `::highlight(ink-fix)` | `rgba(255, 180, 84, 0.26)` | Tint behind text the writer corrected in a model's run |

The provenance tints are literal on purpose: they must stay distinct from the primary and
danger colours.

### Data colours

These carry meaning that grey would lose, so the black-and-white palette (frontend#38) does not
apply to them.

- **Timeline characters:** each character's `color` comes from the server in the
  `/timeline` response (`services/timeline.ts`). The frontend assigns none.
- **Lore graph types and predicates:** `services/loreGraph.ts` generates one `hsl(...)` per
  type or predicate, spread evenly around the hue circle at 62% saturation and 55% lightness.

## Shadows and focus ring

Not colours of their own, so no swatch.

| Token | Read by |
|---|---|
| `--shadow-strong` | Modal.vue, TreeItem.vue (context menu), Tree.vue (root menu) |
| `--shadow-card` | Login.vue |
| `--focus-ring` | 11 uses across components; it is `0 0 0 3px var(--color-primary-soft)` |
