# Routes

The frontend's routes are in `src/router/index.ts`. Every directory and every file has a URL, in
both roots, so a reload, a bookmark and the back button work for any of them.
`src/router/index.spec.ts` fails if a route is added or removed without this document changing.
The API's own routes are in `inkspire-api/docs/routes.md`.

## The routes

`:space` is `stories` or `notes`. An id (`:id`, `:fileId`) is matched as 16 hexadecimal characters,
the length the API gives them, so a word in the path such as `write` is never read as one. A story
is a directory under `stories` and a folder is a directory under `notes`; a chapter and a note are
files in them. A file outside any directory is a one-shot under `stories` and a note at the root
under `notes`.

| Path | Name | Renders | Shows |
|---|---|---|---|
| `/` | `home` | `HomeView.vue` | The homepage |
| `/:space/:id` | `dashboard` | `DashboardView.vue` | A story's page, or a notes folder's page |
| `/:space/:id/write/:fileId` | `write` | `EditorRoute.vue` | A chapter, or a note in a folder |
| `/:space/write/:fileId` | `write-root` | `EditorRoute.vue` | A one-shot, or a note at the notes root |
| `/stories/:id/read` | `read` | `ReadingView.vue` | A story's chapters read in order |
| `/stories/:id/timeline` | `timeline` | `TimelineView.vue` | A story's timeline |
| `/stories/:id/lore` | `lore` | `LoreView.vue` | A story's lorebook as a graph |
| `/story/:rest` | | | Redirects to `/stories/:rest`, so a bookmark from before the notes had routes still opens |

The reading, timeline and lorebook views exist for stories only: a notes folder has no order for its
files, no timeline and no lorebook, so `/notes/:id/read` matches nothing.

## What each page reads from the URL

- `HomeView.vue` reads nothing from the URL. It fetches both `tree` responses and shows "Last
  edited", the five chapters, one-shots and notes of either tree changed most recently
  (inkspire-api#29's `modified`), each a link to its `write` or `write-root` route with how long
  ago it changed; and how many stories, chapters, one-shots, notes folders and notes there are.
  Under the counts is the activity grid (`components/ActivityGrid.vue`): the words written per day
  over the last 52 weeks, from `GET /api/stories/activity` (`services/activity.ts`), brighter for
  bigger days, with a table twin behind a Table/Grid toggle. Under it, one muted line says only
  committed work is counted and how many committable changes are not (`services/git.ts`'s status);
  a failed activity load leaves a single "Activity could not be loaded." line and the rest of the
  page as it is. The activity is read when the page opens, and the git status again whenever the
  sidebar changes a tree. The grid's caption and table count only the days the grid draws.
  Under them are two bar charts (`components/BarChart.vue`, each with a table twin): how many
  chapters and one-shots have each status, and the words in each story, counted from every
  file's prose with one request per file.
- `DashboardView.vue` reads `space` and `id`. It fetches `GET /api/<space>/dir/{id}` and draws the
  name, the synopsis or context (called a synopsis in `stories`, a context in `notes`), and the
  files with a word count each and, where the server sends one, how long ago each changed. It edits
  that text, and deletes the directory. A story also has
  drag-to-reorder, links to the three story views, the git panel, and a forced delete when the
  directory holds more than its chapters. A folder has none of these.
- `EditorRoute.vue` reads `space` and `fileId` and nothing else. It sets the shared file selection
  (`sharedFiles.ts`, a `{space, id}` pair) and renders `Text.vue`, which reads only that selection.
  The `id` of `write` (the directory) is read by the code around it: the delete and rename rules
  below, and the title edit.
- `ReadingView.vue`, `TimelineView.vue` and `LoreView.vue` read `id`, the story.

## How the app moves between them

- **Opening from the sidebar.** A directory's row opens its page; the disclosure triangle only
  expands it. A file's row opens `write` if it has a directory and `write-root` if it has none.
  The rule is the same in both roots (`TreeItem.vue`).
- **Creating.** A new file opens at once, on `write` or `write-root` by the same rule
  (`Tree.vue`).
- **Renaming.** A file's id comes from its path, so renaming it changes the id. If the open route
  is that file's, it is replaced with the new id, keeping the space and the directory
  (`services/rename.ts`). A directory keeps its id through a rename.
- **Deleting a file.** If the open route is that file's, a file in a directory goes back to the
  directory's page and one outside any goes to `/`.
- **Deleting a directory.** It is deleted from its own page, which then goes to `/`. The sidebar's
  menu offers no Delete on a directory.
- **Home.** The "INKSPIRE" title at the top of the sidebar goes to `/` and clears the selection, and
  so does logging in.
- **Back to a story.** The reading, timeline and lorebook views link back to the story's page
  (`BackLink.vue`).

## Keeping the sidebar and the pages in step

The sidebar and an open directory page each hold what they fetched, and neither can see the other
change it. A change made in one is announced to the other with the `stories:changed` window event.
Its `detail` is `{storyId?, space?}`: `storyId` is the directory whose page should reload (not
named when the change is a directory's deletion), and `space` says which tree the sidebar fetches
again. `space` defaults to `stories`. The name is the one the event had before the notes had pages.
The homepage listens to `tree:changed` instead, which carries nothing and is sent after any create,
rename or delete in either root, since a count can change without any directory page being open.

## The selection is not the route

The shared selection decides which file the editor shows. `write` and `write-root` set it from the
URL, and nothing else needs to: opening a file always goes through one of them. Leaving a file for
`/` does not clear it by itself, so the places that move off a file (the "INKSPIRE" title, deleting
the open file) clear the selection too.
