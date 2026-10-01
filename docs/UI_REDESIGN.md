# Admin UI design

This is the design reference of the admin app: the palette and why it looks the way it does, the components every page
shares, and the rules a test enforces so the look stays consistent. It started as the write-up of the redesign (a
presentation-only rework; services, routes, field types and the backend were left alone), and the parts that still
describe the app are kept below.

## In short

- **One palette, from the logo.** Everything is a tint or shade of the logo's indigo plus four muted status colours,
  with text contrast at WCAG AA or better in both themes. Colours, sizes and spacing are CSS tokens in
  `src/styles/tokens.css`; components never hard-code a colour, and `test/frontend/designSystem.test.js` fails if one
  does.
- **Layout.** A top bar, then a sidebar of collapsible resource groups that becomes a 60px rail on tablets and a drawer
  on phones. The record list and the editor sit side by side from 768px wide, one after the other below that.
- **Editing.** A fixed action bar with Save and Discard, a dot on every changed field, per-locale markers for unsaved
  and missing values, a confirmation before you leave unsaved work, and a toast naming the required fields that are
  still empty.
- **Shared pieces.** One button system, one dialog component, one toast host, one state system for form fields
  (editable, read-only, disabled, error). The living reference is in the admin itself: open `#/?id=design-system`.
- **Dark mode** is opt-in: set `disableDarkMode: false` and the top bar gets a theme switch.

To re-theme the admin, change the values in `tokens.css` and the two colour maps at the top of `src/vuetify.js`. To
build a component, follow the [rules at the end](#design-system-rules-enforced-by-testfrontenddesignsystemtestjs).
Known UI problems are tracked in [UI_BUGS.md](UI_BUGS.md).

The screenshots in `docs/ui/` were taken during the redesign. Only the ones this page shows are kept up to date.

## Problems the redesign set out to fix


- Branded look: a third-party wordmark, a black/teal/purple palette and brand-named SCSS tokens spread over ~40 files.
- Navigation: eleven or more resource groups as pills in a top bar, overflowing on anything narrower than ~1080px (`min-width: 1080px` on the layout).
- Not responsive: fixed 364px list column, no phone layout, editor unreachable without horizontal scrolling.
- Contrast: white on light teal (about 1.7:1), grey-on-grey disabled and meta text, `#A00` log colours on `#222`.
- Dark mode was effectively broken: invalid hex values in the Vuetify theme (`'00142E'` without `#`), theme state read from a Vuetify 2 property (`$vuetify.theme.dark`), body class as the only switch.
- Accessibility: clickable `div`/`span`s, no keyboard access to list rows, view toggle, resource selector, locale switch; icon buttons without labels; `*:focus { outline: none }`; 1s toast; spinner ignoring `prefers-reduced-motion`.
- Type: one regular-weight font file with synthetic bold disabled, italics for labels, sizes tied to viewport width.
- States: blank grey panel when nothing is selected, empty lists and unstyled plugin pages.

## Design direction

- Palette: derived from the three logo colours (see "Palette derivation" below). One hue only, plus muted functional status colours.
- Type: system font stack (no font download), token scale 12/13/14/16/18/22/28 px in rem, weights 400/500/600/700, no italics for UI text, fixed sizes (no vw scaling). Inputs are 16px on phones so iOS does not zoom.
- Shape and space: 4px spacing scale, radii 4/6/10/14/pill, two-level shadows.
- Layout: app bar (menu, logo, resource search, language, theme, system/links, logout) plus a persistent left navigation of collapsible resource groups on desktop (at least 1280px). Below that the navigation is an off-canvas drawer with scrim, Escape to close and focus management. List + editor sit side by side from 768px; below that they are two steps (list, then editor with a Back button).
- Field forms: labels above controls, uniform 40px (44px on touch) controls, one focus ring style, dirty fields marked with a dot and a warning border.
- States: skeleton rows while loading, empty states for no resource selection, empty resources and no search results; toasts stay 2.5s (errors stay until closed) and are announced with `role="status"`.

## Palette derivation

The logo (`src/assets/logo.svg`) has three colours: indigo badge `#3846C7`, near-black text `#161B26`, slate `#4A5468`. Everything else is a tint or shade of that indigo (hue about 234 degrees) or a muted status colour. The app bar and sidebar ("chrome") use a deep shade of the indigo with light text; `BrandLogo` has an `on-dark` variant (light wordmark), and the on-dark colours come from the same tokens.

Three surface levels: page (`--cms-bg`) below panels (`--cms-list-bg`, `--cms-bar-bg`, `--cms-crumb-bg`) below cards and fields (`--cms-surface`).

| Role | Light | Dark |
| --- | --- | --- |
| Primary | `#3846C7` | `#9AA6FF` |
| Primary hover / soft / text on soft | `#2D3AA8` / `#E7EAFB` / `#252F9A` | `#B3BCFF` / `#262D5E` / `#D6DBFF` |
| Text / muted (logo near-black, logo slate) | `#161B26` / `#4A5468` | `#E8EAF6` / `#A7ADCB` |
| Page / list column / action bar / breadcrumb band | `#E8EBF6` / `#F1F3FB` / `#E9ECFA` / `#DCE0F3` | `#0D0F1D` / `#111428` / `#1E2447` / `#141833` |
| Card and field surface / surface 2 / surface 3 | `#FFFFFF` / `#EDEFFA` / `#DDE1F3` | `#171B33` / `#202650` / `#2B3266` |
| Border / strong (controls) | `#C5CBE6` / `#6B7290` | `#2E3568` / `#7F87B5` |
| Chrome (app bar, sidebar) / text / muted / hover | `#1B2052` / `#F1F3FF` / `#C3C9F2` / `#2A3175` | `#070914` / `#E8EAF6` / `#A7ADCB` / `#171B3A` |
| Selected nav item | `#3846C7` + accent bar `#B4BCFF` | `#3846C7` + accent bar `#9AA6FF` |
| Error / warning / success / info | `#A8362F` / `#85560A` / `#2D6B52` / `#2C5DA3` | `#F09A93` / `#E6B565` / `#7BCBA5` / `#8DB4F0` |

Contrast ratios (WCAG 2.x relative luminance; required 4.5:1 for text, 3:1 for UI boundaries):

| Pair | Light | Dark |
| --- | --- | --- |
| Text on page / card / list column / action bar / breadcrumb | 14.48 / 17.23 / 15.55 / 14.64 / 13.13 | 15.89 / 14.13 / 15.18 / 12.54 / 14.51 |
| Muted on page / card / list column / action bar / breadcrumb | 6.40 / 7.61 / 6.87 / 6.47 / 5.80 | 8.60 / 7.64 / 8.21 / 6.78 / 7.85 |
| Muted on surface 3 | 5.85 | 5.42 |
| Strong border on card / list column / action bar (3:1) | 4.74 / 4.27 / 4.02 | 4.86 / 5.23 / 4.32 |
| On-primary on primary (buttons) | 7.32 | 8.16 |
| Primary on card / list column / action bar | 7.32 / 6.61 / 6.22 | 7.47 / 8.03 / 6.63 |
| Text on soft (selected rows) | 9.00 | 9.53 |
| Chrome text / muted on chrome | 13.82 / 9.42 | 16.57 / 8.96 |
| Chrome text / muted on chrome hover | 10.59 / 7.22 | 13.98 / 7.56 |
| White on selected nav item | 7.32 | 7.32 |
| Chrome badge text on badge / muted on badge | 8.68 / 6.55 | 9.64 / 6.66 |
| Error on card / soft / action bar | 6.49 / 5.70 / 5.52 | 7.86 / 6.95 / 6.97 |
| Warning on soft | 5.63 | 7.68 |
| Error button (white / dark text) | 6.49 | 8.58 |

The dark theme is opt-in through the existing `disableDarkMode: false` server option.

## Button system

Defined once: Vuetify props map to variants (`src/vuetify.js` defaults plus `src/styles/base.css`), no per-component overrides. Living reference: open `#/?id=design-system` in the admin.

| Variant | How | Use |
| --- | --- | --- |
| Primary | `<v-btn>` (filled indigo, white text) | one main action per view (Save, Confirm, Create) |
| Secondary | `variant="outlined"` | Cancel, Discard, Keep editing, supporting actions |
| Tertiary | `variant="text"` (icon-only for toolbars, with aria-label and title) | low emphasis |
| Destructive | `color="error"` filled / `variant="outlined" color="error"` | final confirmation / entry point such as Delete |

Sizes: default 36px, compact (`size="small"`) 32px, 44px on coarse pointers. Sentence case, medium weight, no letter spacing or uppercase anywhere. States: hover, pressed, focus ring, disabled (neutral fill, muted text, still readable), loading (spinner before the label, label kept). Toggles and chips (`.toggle-mode-btn`, `.filter-chip`, locale switchers, Vuetify chips) share the pill shape and the soft-indigo selected state.

Dialogs: one component, `components/AppDialog.vue` (discard, delete, config restart, replicator), with `DialogService.ask()` for promise based confirmations. Icon (info, warning, destructive), semibold title, body, footer with cancel left and primary right, `alertdialog` role with `aria-labelledby/describedby`, the safe button focused first on destructive dialogs, Escape cancels, focus returns to the trigger. Toasts (`components/ToastHost.vue`): bottom centre, max 3, named messages (no raw ids), pause on hover or focus, errors persist and can hold an action.

## Dirty tracking and locale markers

`src/utils/dirtyTracker.js` is the single source of truth: a normalised snapshot of the record (taken when it loads or is saved) is compared with the current model by a deep watcher, so every field type is covered. Empty rich text (`""`, `<p></p>`, `<p><br></p>`), blanks, empty arrays/objects and unchecked booleans are equivalent, so an untouched WYSIWYG is clean and typing then deleting returns to clean. Per-locale results drive the locale tabs: an amber dot only on tabs whose own localised values changed, a red circle with `!` (and a count) on tabs with missing required fields, shared required fields are flagged on the field and in the "Jump to field" menu. Note: typing into a WYSIWYG did mark the form dirty in the branch as tested; the bug found was that it never returned to clean (`<p></p>` versus nothing) and that Discard did not reset rich text, both fixed (Discard remounts the form).

## Frontend tests

The pure logic behind the UI (dirty tracker, table model, sidebar model, preferences, date formats, highlight) and the design-system rules have tests in `test/frontend`, next to component tests that mount real components. How to run them and what they cover: [TESTING.md](TESTING.md).

## Editorial workflow features

- List: dense rows with title, updated-by, updated-at and a read-only badge; the id appears on hover, focus and selection. Search stays focused while typing; `/` jumps to search from anywhere outside a field; Up/Down/Home/End move between rows and Enter opens one; sort and an "Updated by me" filter are always visible; the table view keeps the same toolbar.
- Editor: the action bar stays fixed above the scrolling form and shows "Unsaved changes" / "All changes saved", Discard and Save. Leaving the record, the resource, logging out or closing the tab with unsaved changes asks first (dialog buttons "Keep editing" / "Leave without saving", native prompt for the tab). Required and invalid fields show an inline message and a red boundary once the field is left or a save is attempted; dirty fields carry a dot. The locale switcher marks locales that still miss a required field. Forms with more than six fields get a "Jump to field" outline menu.
- Navigation: the sidebar has a resource filter, collapsible groups whose state is remembered in `localStorage`, and a breadcrumb (group / resource / record) above the content. Ctrl/Cmd+K opens the quick switcher from anywhere, including inside form fields.
- Feedback: save, delete and error results are toasts (2.5s, errors persist until closed). Deleting one or many records opens a dialog that names the record(s) and says it cannot be undone. Loads show list skeletons and a thin progress bar under the app bar instead of dimming the page.
- Attachments: dashed drop area with drag highlight, thumbnails with filename and size, a labelled remove button per file and a grab cursor on the drag handle for reordering.

## Table view

Resources with `view: 'table'` use `RecordTable.vue` (state, toolbar, bulk bar, footer) around `VueTableGenerator.vue` (the grid) and `TableCell.vue` (one cell per column kind). All pure logic lives in `src/utils/tableModel.js` and is covered by `test/frontend/tableModel.test.js` and `tableView.test.js`.

![Table, light](ui/table-light-1500x900.png)
![Table, dark, 1280x720](ui/table-dark-1280x720.png)

- Toolbar: the same look as the list. Resource selector (`ResourceSelector.vue`), `SearchField` with clear button, "Add new record" as the primary button. A second row holds the locale switcher, the "All languages" toggle, the column menu and the density menu; it turns into the bulk bar (count, clear, "Delete selected") while rows are selected.
- Locales: only the selected locale's columns are shown; "All languages" expands every locale of every localised field. The header carries a small locale badge only while several locales are visible, and a missing translation shows a muted dash with the title "Not translated".
- Columns: widths per input type (`WIDTHS` in tableModel), narrow tables stretch the flexible columns, a header label is never clipped, cell text ends in an ellipsis and gets a title tooltip only when it really overflows. Sticky header row, sticky checkbox and first column, sticky actions column, soft edge shadows while scrolled.
- Column menu: show, hide, reorder with up/down buttons, Reset. Choices are remembered per resource in `localStorage` (`node-cms.table.columns.<resource>`: hidden, order, showAllLocales, sortBy). A resource author can pick and order the default columns with `options.index`; wide schemas without indexes start with the first 8 columns.
- Sorting: click a header (`aria-sort`, arrow), click again for descending, again to clear, shift-click adds a secondary sort (rank shown next to the arrow). Empty values always sort last.
- Rows: 32 / 40 / 48px (compact, default, comfortable, tokens `--cms-table-row-*`, 44px minimum on touch), hover tint, selected tint with a thin accent bar, windowed rendering (fixed row height, spacer rows) so hundreds of records stay light. Keyboard: Tab enters the grid (one tab stop), arrows move between rows and cells, Home/End, Ctrl+Home/End, PageUp/PageDown, Enter opens, Space selects, Ctrl+A selects all, Escape clears the selection. Shift-click on a checkbox selects a range.
- Actions: small ghost icon buttons (`.cms-icon-btn`), visible on hover, focus and always on touch devices.
- Cells by type: check or dash for booleans, chips with "+n" for multi values, thumbnails with a muted placeholder, ISO dates as `YYYY-MM-DD` / `YYYY-MM-DD HH:mm`, tabular numbers, links only for `http(s)` and `mailto`.
- States: skeleton rows while loading, compact empty states (title plus one hint line, no button) for "Nothing here yet!" and "No results", footer with the record count ("12 of 60 records" when filtered) and the number of hidden columns.
- Phones (under 560px of grid width): the grid scrolls horizontally, the first column keeps a short sticky width and the actions column scrolls with the row.

![Table on a phone](ui/table-phone-light.png)

## Form field states

One state system for every control (`base.css`, tokens `--cms-field-*`), shown in the design-system page under "Form controls".

![Form controls, light](ui/ds-forms-light.png)
![Form controls, dark](ui/ds-forms-dark.png)

| State | Surface | Border | Text | Icon | Cursor | Focus | Contrast |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Editable | `--cms-field-bg` (surface) | 1px `--cms-border-strong`, hover `--cms-text-muted` | `--cms-text`, placeholder `--cms-text-muted` | none | text | accent border plus 3px ring `--cms-field-ring` | border 4.7:1 (light) / 5.0:1 (dark) on surface, text 17.2:1 / 14.2:1 |
| Read-only | `--cms-field-readonly-bg` (surface 2) | none (transparent) | `--cms-text`, selectable and copyable | lock at the right, `aria-readonly` | default | accent border and ring when focused | text 15.8:1 (light), 12.8:1 (dark) |
| Disabled | `--cms-field-disabled-bg` (page) | 1px dashed `--cms-border-strong` | `--cms-text-muted` | none | not-allowed | not focusable | text 6.7:1 (light), 8.2:1 (dark) |
| Error | as editable | 1px `--cms-error` | inline message in `--cms-error` with a "!" icon | "!" before the message, `*` on the label when required | text | accent ring | error 6.5:1 / 8.1:1 on surface |
| Loading or computed | skeleton or spinner in the field | as editable | muted | spinner | progress | n/a | n/a |

Every control height is `--cms-field-h` (40px, 44px on touch and phones), labels are 13px semibold above the control, helper and error text are 13px. Read-only means the value is real but cannot be edited; disabled means the field is not available (dashed, muted). Controls: inputs and textarea (`CustomInput`, `CustomTextarea`), selects, multi selects and pillbox (Vuetify fields), date, datetime and time (`CustomDatetimePicker`), switch (`CustomCheckbox`, `role="switch"`, keyboard operable), JSON viewer, wysiwyg, code, colour and file or image drop zones keep their own surface but use the same border, radius and focus tokens.

Date and time fields: a leading calendar icon inside a white 40px field, muted format placeholder, typing and picking both work (typed text is parsed with the schema format, dayjs tokens are translated by `src/utils/dateFormat.js`), clear button, a "Now" shortcut for datetime and time, the popup follows the dropdown surface, radius and elevation. Read-only shows the lock, disabled the dashed style.

## Dropdowns

Menus, selects and autocompletes share `base.css` and the Vuetify defaults. `CustomMultiSelect` adds: match highlighting in the option text (`highlightSegments`), a secondary line (`options.subtitle` Mustache template, or the id for options that come from another resource), group headings (`options.groupBy`, `withGroupHeadings`), a "No matches" state, a clear button on non-required single selects, and a lock icon when read-only. The type-ahead search is the field's own input; role, `aria-expanded`, `aria-activedescendant` and keyboard support are the Vuetify combobox ones.

## List rows

Rows have three lines: title (semibold, one line, ellipsis and tooltip), meta ("Updated by localAdmin · a few seconds ago", 12px, muted, wraps instead of truncating, a lock icon marks read-only records) and the full record id on its own line (11px monospace, muted, `overflow-wrap: anywhere`). Sizes are tokens: `--cms-record-title-fs`, `--cms-record-title-fw`, `--cms-record-meta-fs`, `--cms-record-id-fs` (the table's first column uses the same title weight), row heights `--cms-list-row` (68px) and `--cms-list-row-compact` (48px). The density button in the controls row switches to compact rows (title and meta, the id in the tooltip and shown instead of the meta line on the selected row); the choice is remembered (`node-cms.ui.list.density`). A ghost copy button appears on hover and focus (also the `c` key on a focused row) and shows an "Id copied" toast. Semantics: `listbox` with `option` rows and `aria-selected`.

![List rows](ui/list-light-1280x720.png)
![Compact rows, dark](ui/list-compact-dark-1280x720.png)

## Sidebar rail

The sidebar has three modes (`resolveNavMode` in `src/utils/navModel.js`): expanded (default from 1280px), rail (default from 768px to 1279px) and the off-canvas drawer under 768px. The toggle sits at the top of the sidebar (`aria-label`, `aria-expanded`, `aria-controls`) and Ctrl/Cmd+B toggles it too (ignored inside text fields, where Ctrl+B means bold); the choice is remembered (`node-cms.ui.nav.mode`). The width changes in 160ms (`--cms-motion-nav`, none with reduced motion) and the content is clipped so nothing jumps.

- Rail (`NavRail.vue`, 60px): one badge per group with the initials (`groupInitials`: "2. Exploration App" is EA) on one of six calm tints (`--cms-rail-tint-*`, chosen from a hash of the group name so a group always keeps its colour, text on tint at least 4.5:1, tested), an accent bar at the left edge for the group that holds the current resource, the N badge in the app bar instead of the wordmark, a search icon that opens the quick switcher, and the resources of the regular "Others" group as separate badges in a bottom section.
- Flyout: opens on hover, keyboard focus, click and Enter; header with the group name and count, active item highlighted; Up/Down/Home/End move between items, Escape or Left closes and returns focus to the badge, outside click and focus-out close it. Every icon has a `title` and an `aria-label`; the nav landmark is labelled "Resources".
- Expanded: a drag handle on the right edge (`role="separator"`, `aria-valuenow` 200 to 360, arrows change it by 16px, double-click resets to 248, remembered as `node-cms.ui.nav.width`).

![Rail with flyout](ui/rail-flyout-light-1500x900.png)
![Rail on a tablet, dark](ui/rail-tablet-dark.png)
![Drawer on a phone](ui/rail-phone-drawer-light.png)

The sticky title and filter block of the expanded sidebar uses 12 to 16px padding, sits on the opaque sidebar surface and shows a divider and shadow only once the list has scrolled. Scrollbars everywhere are thin and palette coloured with no arrow buttons (`base.css`; WebKit pseudo-elements for Chromium and Safari, `scrollbar-width` for Firefox). The breadcrumb truncates its middle segments first and keeps the last one readable, every segment has a title, the last has `aria-current`. Auto-selection of the first resource moved from `ResourceList` to `App` (it does not run on the design-system page).

## Where things live

| Concern | File |
| --- | --- |
| Colour, radius, spacing, type, layout, motion tokens (light + dark) | `src/styles/tokens.css` |
| Vuetify palette (light + dark) and component defaults | `src/vuetify.js` |
| Global element, focus, reduced-motion and Vuetify overrides | `src/styles/base.css` |
| SCSS aliases onto the tokens (legacy names kept for old component styles) | `src/assets/scss/variables.scss` |
| Typography mixins (now token based) | `src/assets/scss/mixins.scss` |
| Theme switching helper (sets `data-theme` on `<html>`) | `src/utils/theme.js` |
| Table model, sidebar model, persisted preferences, date formats, highlight | `src/utils/tableModel.js`, `navModel.js`, `preferences.js`, `dateFormat.js`, `highlight.js` |
| Table, rail, list | `RecordTable.vue`, `VueTableGenerator.vue`, `TableCell.vue`, `TableColumnMenu.vue`, `NavRail.vue`, `ResourceSelector.vue`, `RecordList.vue` |
| Logo (inline component and standalone SVG) | `src/components/BrandLogo.vue`, `src/assets/logo.svg`, `public/favicon.svg` |

To re-theme: change values in `tokens.css` and the two colour maps at the top of `src/vuetify.js`. Dark mode is opt-in through the existing `disableDarkMode: false` server option; the choice is applied via `data-theme` on `<html>` so teleported overlays follow it.

## Accessibility summary

WCAG AA text contrast, visible `:focus-visible` rings everywhere, forced-colors fallback, skip link, `aria-label`s on icon buttons, `aria-pressed`/`aria-expanded`/`aria-current` on toggles and navigation, labelled inputs, `role="alert"` login errors, `prefers-reduced-motion` disables animations and the spinner rotation, 44px touch targets on coarse pointers.

## Status and hand-off

Done: palette and surfaces, dark chrome with logo variant, button system and reference page (buttons, chips, dialogs, toasts, dropdowns, form controls), shared dialog and toast host, sidebar tree and rail, per-file upload progress with retry, import/sync/replicator toasts, one-row list toolbar, single-record layout, attachment drop area, central dirty tracker and per-locale markers, shared `SearchField`, the table view rework, the form field state system with date and time fields, list rows with the full id and density, sticky sidebar filter, thin scrollbars, breadcrumb truncation, dropdown completion.

Partly done: the dropdown type-ahead is the field's own input (no separate search box inside the menu); read-only and disabled surfaces are applied to the input, select, date, switch and JSON controls, while the wysiwyg, code and colour editors only follow the shared border, radius and focus tokens; table search and the syslog filter: the table uses `SearchField`, the syslog filter keeps its terminal styling with its own clear button and now handles Escape (not verified in a browser because the plugin page needs a group with plugin access).

Known issues are tracked in [UI_BUGS.md](UI_BUGS.md). `Ctrl/Cmd+B` not toggling the sidebar inside a text field is deliberate: there it means bold.

Fixed since the previous hand-off: `CmsImport.executeXlsx` now posts to `import/executeXlsx`; "1 resources match" is pluralised in both languages; the table no longer builds a regular expression from what is typed in the search field.

## Design system rules (enforced by `test/frontend/designSystem.test.js`)

- Every colour, radius, spacing, type, shadow and density value comes from `src/styles/tokens.css`. Vuetify's own palette in
  `src/vuetify.js` mirrors the key colours (the test checks primary, surface-2 and background stay in step).
- Components never hard-code a colour (`#hex`, `rgb()`, `hsl()`). The test fails on any literal outside `tokens.css` and
  `vuetify.js`. If a colour is missing, add a token, in both palettes when it changes with the theme.
- Interaction states use tokens too: `--cms-overlay-hover` and `--cms-overlay-strong` on content surfaces,
  `--cms-chrome-hover` on the dark chrome (a faint translucent lift, never a solid block), `--cms-nav-active-bg` for the
  selected navigation item.
- Density is a token: `--cms-nav-group-row` and `--cms-nav-item-row` set the height of the resources column rows.
- Code blocks and the log viewer use the `--cms-code-*`, `--cms-syntax-*`, `--cms-terminal-*` and `--cms-log-*` tokens.
- `!important` is a patch. The test allows the current number at most and fails if it grows; lower the baseline in the test
  when you remove some.
- Every `--cms-*` variable that is used must be defined, and every colour token defined for the light palette must also be
  defined for the dark one.
