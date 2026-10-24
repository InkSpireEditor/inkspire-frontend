# Colours

Every colour the interface uses, as a swatch, with what reads it. The tokens are defined in
`src/assets/base.css`; the dark theme redefines some of them under `body.dark-theme`.
`src/assets/colors.spec.ts` fails if a colour token or swatch here disagrees with `base.css`,
so edit both together.

"Used by" lists the files that read the token with `var(...)`. It does not list the other
tokens in `base.css` that read it: `--focus-ring` reads `--color-primary-soft`, and in dark
theme `--selected-border` reads `--color-primary`.

## Base colours

Named by hue and step. Components do not read these; the semantic tokens below do.

| Token | Swatch | Value | Read by |
|---|---|---|---|
| `--ink-c-white` | ![](colors/ink-c-white.svg) | `#ffffff` | `--color-background-soft` |
| `--ink-c-white-soft` | ![](colors/ink-c-white-soft.svg) | `#f5f5f5` | `--color-background` |
| `--ink-c-black` | ![](colors/ink-c-black.svg) | `#121212` | `--color-background` |
| `--ink-c-black-soft` | ![](colors/ink-c-black-soft.svg) | `#1e1e1e` | `--color-background-soft` |
| `--ink-c-black-mute` | ![](colors/ink-c-black-mute.svg) | `#2a2a2a` | `--color-background-mute` |
| `--ink-c-grey-dark` | ![](colors/ink-c-grey-dark.svg) | `#212121` | `--color-heading`, `--color-text` |
| `--ink-c-grey-light` | ![](colors/ink-c-grey-light.svg) | `#e0e0e0` | `--color-heading`, `--color-text` |
| `--ink-c-grey-medium` | ![](colors/ink-c-grey-medium.svg) | `#bdbdbd` | `--color-border-hover`, `--icon-color` |
| `--ink-c-blue` | ![](colors/ink-c-blue.svg) | `#2196f3` | `--color-primary`, `--color-primary-hover`, `--selected-border` |
| `--ink-c-blue-dark` | ![](colors/ink-c-blue-dark.svg) | `#1976d2` | `--color-primary-hover` |
| `--ink-c-blue-deep` | ![](colors/ink-c-blue-deep.svg) | `#086490` | `--hover-background` |
| `--ink-c-blue-light` | ![](colors/ink-c-blue-light.svg) | `#1186e3` | `--color-primary` |
| `--ink-c-red` | ![](colors/ink-c-red.svg) | `#f44336` | `--color-danger` |
| `--ink-c-divider-light` | ![](colors/ink-c-divider-light.svg) | `#e0e0e0` | `--color-border` |
| `--ink-c-divider-dark` | ![](colors/ink-c-divider-dark.svg) | `#424242` | `--color-border` |

## Semantic tokens

What components read. Each one is a base colour or a literal value, per theme.

| Token | Light | Dark | Used by |
|---|---|---|---|
| `--color-background` | ![](colors/color-background-light.svg) `#f5f5f5` | ![](colors/color-background-dark.svg) `#121212` | App.vue, Login.vue, Modal.vue, ModelSelector.vue, SidePanel.vue, Tree.vue, TreeItem.vue |
| `--color-background-soft` | ![](colors/color-background-soft-light.svg) `#ffffff` | ![](colors/color-background-soft-dark.svg) `#1e1e1e` | DashboardView.vue, GenerationInstruction.vue, GenerationSettings.vue, GitPanel.vue, Login.vue, LoreView.vue, MarkdownEditor.vue, Modal.vue, ModelSelector.vue, Text.vue, TimelineView.vue, Tree.vue |
| `--color-background-mute` | ![](colors/color-background-mute-light.svg) `#f2f2f2` | ![](colors/color-background-mute-dark.svg) `#2a2a2a` | App.vue, DashboardView.vue, GitPanel.vue, Modal.vue, Text.vue, Tree.vue, TreeItem.vue |
| `--color-border` | ![](colors/color-border-light.svg) `#e0e0e0` | ![](colors/color-border-dark.svg) `#424242` | App.vue, DashboardView.vue, GenerationInstruction.vue, GenerationSettings.vue, GitPanel.vue, Login.vue, LoreView.vue, MarkdownEditor.vue, Modal.vue, ModelSelector.vue, ReadingView.vue, SidePanel.vue, Text.vue, TimelineView.vue, Tree.vue, TreeItem.vue |
| `--color-border-hover` | ![](colors/color-border-hover-light.svg) `#bdbdbd` | ![](colors/color-border-hover-dark.svg) `#555555` | GenerationSettings.vue, ModelSelector.vue, Text.vue, Tree.vue |
| `--color-heading` | ![](colors/color-heading-light.svg) `#212121` | ![](colors/color-heading-dark.svg) `#e0e0e0` | DashboardView.vue, GenerationSettings.vue, GitPanel.vue, Login.vue, LoreView.vue, Modal.vue, ModelSelector.vue, ReadingView.vue, SidePanel.vue, Text.vue, TimelineView.vue, Tree.vue |
| `--color-text` | ![](colors/color-text-light.svg) `#212121` | ![](colors/color-text-dark.svg) `#e0e0e0` | App.vue, BackLink.vue, DashboardView.vue, GenerationInstruction.vue, GenerationSettings.vue, GitPanel.vue, Login.vue, LoreView.vue, MarkdownEditor.vue, Modal.vue, ModelSelector.vue, ReadingView.vue, SidePanel.vue, Text.vue, TimelineView.vue, Tree.vue, TreeItem.vue |
| `--color-primary` | ![](colors/color-primary-light.svg) `#2196f3` | ![](colors/color-primary-dark.svg) `#1186e3` | App.vue, DashboardView.vue, Login.vue, MarkdownEditor.vue, Modal.vue, ModelSelector.vue, Text.vue, TimelineView.vue, Tree.vue, TreeItem.vue, main.css |
| `--color-primary-hover` | ![](colors/color-primary-hover-light.svg) `#1976d2` | ![](colors/color-primary-hover-dark.svg) `#2196f3` | Login.vue, Modal.vue, Text.vue |
| `--color-primary-soft` | ![](colors/color-primary-soft-light.svg) `rgba(33, 150, 243, 0.1)` | ![](colors/color-primary-soft-dark.svg) `rgba(17, 134, 227, 0.2)` | Text.vue, TreeItem.vue, main.css |
| `--color-danger` | ![](colors/color-danger-light.svg) `#f44336` | ![](colors/color-danger-dark.svg) `#f44336` | DashboardView.vue, GenerationSettings.vue, GitPanel.vue, Login.vue, LoreView.vue, Modal.vue, ModelSelector.vue, ReadingView.vue, TimelineView.vue |
| `--hover-background` | ![](colors/hover-background-light.svg) `#e3f2fd` | ![](colors/hover-background-dark.svg) `#086490` | Tree.vue |
| `--selected-border` | ![](colors/selected-border-light.svg) `#2196f3` | ![](colors/selected-border-dark.svg) `#1186e3` | *nothing* |
| `--icon-color` | ![](colors/icon-color-light.svg) `#555` | ![](colors/icon-color-dark.svg) `#bdbdbd` | *nothing* |

## Colours outside `base.css`

| Where | Value | What it is |
|---|---|---|
| `components/MarkdownEditor.vue`, `::highlight(ink-gen)` | `rgba(111, 209, 139, 0.22)` | Tint behind text a model wrote |
| `components/MarkdownEditor.vue`, `::highlight(ink-fix)` | `rgba(255, 180, 84, 0.26)` | Tint behind text the writer corrected in a model's run |
| `components/Modal.vue` | `rgba(0, 0, 0, 0.5)` | Overlay behind an open dialog |
| `views/LoreView.vue` | `#181818` / `#f8f8f8` | Fallback canvas colour for the graph, used only when `--color-background` cannot be read |
| `views/LoreView.vue` | `#999` | Fallback for a link or node with no entry in the type/predicate palette |

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
| `--shadow-normal` | Tree.vue |
| `--shadow-strong` | Modal.vue, TreeItem.vue (context menu), Tree.vue (root menu) |
| `--shadow-card` | MarkdownEditor.vue, Login.vue, Text.vue |
| `--focus-ring` | 11 uses across components; it is `0 0 0 3px var(--color-primary-soft)` |

## Problems found

Listed so the next passes remove them.

- **Unused:** `--icon-color`, `--selected-border`. Nothing in `src/` reads either.
- **Read once, and about to go:** `--hover-background` (Tree.vue; frontend#41),
  `--shadow-normal` (Tree.vue; frontend#42).
- **Same value, two names:** `--ink-c-grey-light` and `--ink-c-divider-light` are both
  `#e0e0e0`. `--color-heading` and `--color-text` resolve to the same colour in both themes.
- **Literal values inside the semantic block** instead of a base colour: `--color-background-mute`
  in light theme (`#f2f2f2`), `--color-border-hover` in dark theme (`#555555`),
  `--hover-background` in light theme (`#e3f2fd`), `--icon-color` in light theme (`#555`).
- **Hover that cannot be seen:** the light-theme hover colour `#f2f2f2` sits on a `#f5f5f5`
  canvas, a difference of 3 out of 255.
- **The dark theme was tuned separately from the light one:** the semantic tokens above do not
  step by the same amount between themes. This is no longer a goal (frontend#38).
