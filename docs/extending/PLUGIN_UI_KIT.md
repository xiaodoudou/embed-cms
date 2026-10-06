← [Documentation](../README.md)

# The UI kit for plugins

> Phase 0 of the [plugin system](PLUGIN_SYSTEM_DESIGN.md). The look itself is in the [Design system](DESIGN_SYSTEM.md), which also draws every class below in both themes (`#/?id=design-system`, section "Plugin UI kit").

A plugin should look like it belongs in the admin without knowing how the admin is built. Vuetify gives Vue plugins that for free, and it stays fully supported: every `v-*` component works in a plugin. But not everyone writes Vue, and even a Vue plugin sometimes just wants a table or a box. So the plugin system also ships a **UI kit made of CSS only**: a set of classes, built on the design tokens, that style plain HTML. No JavaScript, no framework, the same result in light and dark.

**The kit adds to Vuetify, it doesn't replace it.** Use Vuetify, the kit, or both on one page: they read the same tokens, so a `v-card` and a `cms-card` sit side by side without looking different.

## The rules

1. **Tokens only.** Every colour, space, radius, size and shadow in the kit comes from a `--cms-*` token. The kit never hard-codes a value, and the test that guards the Design system checks the kit file like any other.
2. **Plain HTML, plain classes.** A class is a `cms-` name (`cms-card`), a variant is a modifier class (`is-primary`), a state is the real HTML attribute where there is one (`disabled`, `readonly`, `aria-invalid`, `aria-sort`, `aria-current`). No build step, no generated names.
3. **Semantic before visual.** A class says what a thing is (a warning callout), never what it looks like (a yellow box).
4. **Accessible by default.** The focus ring, 44px touch targets on coarse pointers, AA contrast, and `prefers-reduced-motion` are part of the classes, not something an author adds.
5. **Logical properties.** The kit uses `margin-inline`, `padding-block` and the like, so right-to-left layouts work.
6. **One home for the new classes.** The kit is one SCSS file, `src/styles/kit.scss`, compiled with the rest of the admin's CSS. The classes the admin had before it (`cms-page`, `cms-card`, `cms-empty`, `cms-chip`, `cms-toolbar`, `cms-icon-btn`, `cms-kbd`, `cms-check`) keep their names, so nothing in an existing plugin changes.
7. **A public API.** Class names and the public tokens don't change inside a major version. New classes may be added in a minor one.

## Where it sits in the CSS

The kit is plain CSS, not a layer. The admin's `base.scss` has element rules (`ul, li { padding: 0 }`, `a { color }`), and unlayered rules beat any layer, so a layered kit would lose to them. The kit uses single-class selectors, loaded after `base.scss` and after Vuetify's layers:

```
vuetify-core  <  vuetify-components  <  the kit and the admin's CSS  <  a plugin's CSS
```

A plugin's own CSS wins over the kit by coming later or by being more specific, and nothing needs `!important`.

## What's in it

### Foundations

| Class | What it does |
|---|---|
| `cms-h1`, `cms-h2`, `cms-h3`, `cms-h4` | The heading sizes and weights of the admin, without the browser's margins |
| `cms-text`, `cms-text-sm`, `cms-text-muted` | Body text, small text, muted text |
| `cms-text-primary`, `-success`, `-warning`, `-error` | Text in a status colour |
| `cms-code`, `cms-kbd` | Inline code and a keyboard key, in the monospace token |
| `cms-divider` | A hairline in `--cms-border` |
| `cms-visually-hidden` | Hidden on screen, read by screen readers (exists) |
| `cms-p-N`, `cms-m-N`, `cms-gap-N` | Padding, margin and gap from the space scale. N is 1, 2, 3, 4, 5, 6, 8, 10 or 12 (`--cms-space-N`; there is no 7 or 9) |

### Links

| Class | What it does |
|---|---|
| `cms-link` | The primary colour, an underline on hover and focus, the focus ring, a calmer colour once visited |
| `cms-link is-muted` | The same, in the muted text colour, for secondary links |
| `cms-link-card` | Makes a whole card or row one link: a block with a hover and focus state (use it on the `a` itself) |
| `a[target="_blank"].cms-link` | Gets a small "opens elsewhere" arrow after it, with no extra markup |

Links to the admin itself use the admin's addresses: `#/?id=articles` for a resource and `#/?id=articles&record=<id>` for a record. `host.navigate` builds them for you (see the [host API](PLUGIN_SYSTEM_DESIGN.md#2-the-host-api)).

### Layout

| Class | What it does |
|---|---|
| `cms-page`, `cms-page-header`, `cms-page-title`, `cms-page-subtitle`, `cms-page-inner` | The padded, scrolling page with a title (exists) |
| `cms-stack` | A vertical stack. The gap is `--stack-gap` (default `--cms-space-4`) |
| `cms-row` | A horizontal row that wraps, with a gap, aligned centre. `is-between` pushes the ends apart, `is-end` aligns right |
| `cms-grid` with `cms-col-1` … `cms-col-12` | A 12-slot grid like the [dynamic layout](../reference/DYNAMIC_LAYOUT.md): a column takes N of 12 from 600px up, and is full width under it. `cms-col-md-N` takes over from 768px and `cms-col-lg-N` from 1024px |
| `cms-split` | A fixed-width side column and a flexible main column (`cms-split-side`, `cms-split-main`); they stack under 768px |
| `cms-toolbar` | A row of controls with the admin's toolbar look (exists) |
| `cms-section` | A titled block with a divider above it, room around it and a gap between its parts |

The breakpoints are **600**, **768** and **1024** pixels, also given as the tokens `--cms-bp-sm`, `--cms-bp-md` and `--cms-bp-lg` for reference (a media query can't read a custom property, so write the number there).

### Boxes and surfaces

| Class | What it does |
|---|---|
| `cms-card` | The standard box: surface colour, border, radius (exists). Parts: `cms-card-header`, `cms-card-body`, `cms-card-footer`. Variants: `is-flat` (no border), `is-raised` (shadow), `is-interactive` (hover, focus ring and a pointer, for a clickable card) |
| `cms-panel` | An inset box on `--cms-surface-2`, for a group of related controls inside a card |
| `cms-callout` | A message box with a left bar. The info look is the default; `is-success`, `is-warning` and `is-error` change it. Add `role="status"` or `role="alert"` as needed |
| `cms-stat` | A big number with a label and a hint: `cms-stat-value`, `cms-stat-label`, `cms-stat-hint`. This is the card of the dashboard example |
| `cms-empty` | An empty state: icon, title, text (exists) |
| `cms-skeleton` | A loading placeholder that shimmers (and doesn't, with reduced motion) |

### Tables

The record grid of the admin is `cms-table`, so the table of the kit is `cms-datatable`.

```html
<div class="cms-datatable-scroll">
  <table class="cms-datatable is-hover is-striped">
    <thead><tr><th aria-sort="descending">Name</th><th class="cms-num">Total</th></tr></thead>
    <tbody><tr><td><a class="cms-link" href="#/?id=articles">Articles</a></td><td class="cms-num">7</td></tr></tbody>
  </table>
</div>
```

| Class | What it does |
|---|---|
| `cms-datatable-scroll` | The wrapper: horizontal scroll on small screens, a sticky header, the card border and radius |
| `cms-datatable` | The table: row dividers, the header look, the cell padding |
| `is-hover`, `is-striped`, `is-compact` | A hover tint, alternating rows (the same stripe as the compact record list), tighter rows |
| `th[aria-sort]` | A sort arrow and a pointer on a sortable header, from the attribute alone |
| `cms-num` | Right-aligned numbers in tabular figures |
| `cms-cell-truncate` | One line with an ellipsis, the full text in the `title` |

### Lists

`cms-list` and `cms-list-item` are the flat rows of the compact record list: a hairline between rows, a left bar and the soft fill on `is-selected`, a hover tint, and the same stripe with `is-striped`. A `cms-list-item` can be an `a` or a `button`.

### Forms

| Class | What it does |
|---|---|
| `cms-field` | A label above a control, with a hint and an error under it. Parts: `cms-label`, `cms-hint`, `cms-error` |
| `cms-label[data-state="readonly"]`, `[data-state="disabled"]` | `readonly` draws the lock after the label, as a CSS mask of the Material Design Icons lock, like the admin's fields. `disabled` draws no icon: the field is greyed out with a dashed border |
| `cms-input`, `cms-select`, `cms-textarea` | The control: field surface, strong border, hover, the focus ring, and the read-only, disabled and error looks from `:disabled`, `[readonly]` and `[aria-invalid="true"]` |
| `cms-check`, `cms-switch` | A checkbox and the admin's switch (`cms-check` exists) |

### Buttons and actions

| Class | What it does |
|---|---|
| `cms-btn` | A button at the field height. Variants: `is-primary`, `is-secondary` (outlined), `is-tertiary` (text), `is-danger`, `is-danger-outline`. Sizes: `is-sm` |
| `cms-icon-btn` | An icon-only button, 32px, with a visible focus ring (exists) |
| `cms-btn-group` | Joins buttons into a group |
| `cms-toggle` | A segmented control, like the language switch and the All / Me toggle. Mark the selected button with `aria-pressed="true"`, and a CSS-only box slides to it |

### Feedback

| Class | What it does |
|---|---|
| `cms-badge` | A small status label, neutral by default. Variants: `is-primary`, `is-success`, `is-warning`, `is-error` |
| `cms-chip` | A rounded chip, optionally with a close button (exists) |
| `cms-progress` | A thin progress bar (`value` and `max`) |
| `cms-spinner` | A small spinner in `currentColor` |
| `[data-tip]` | A CSS-only tooltip for short hints. Use `title` when a plain browser tooltip is enough |

Toasts and confirmation dialogs aren't CSS: they come from `host.notify` and `host.confirm`, so every plugin shares the same ones.

### Icons

`cms-icon` sizes an inline SVG in `currentColor` (default size, or `is-lg`). `host.icon(name)` returns the SVG of any icon the admin uses (the same Material Design Icons set), so a plugin doesn't ship its own copy.

## An example, with no Vuetify

The dashboard of the [plugin guide](PLUGINS.md), written for the kit. It's plain HTML, so it also works in a React or Svelte plugin, or in a shadow root (see below):

```html
<div class="cms-page">
  <div class="cms-page-inner">
    <header class="cms-page-header"><h1 class="cms-page-title">Dashboard</h1></header>

    <div class="cms-grid">
      <a class="cms-col-3 cms-card is-interactive cms-link-card" href="#/?id=articles">
        <div class="cms-card-body cms-stat">
          <span class="cms-stat-label">Articles</span>
          <span class="cms-stat-value">7</span>
          <span class="cms-stat-hint">5 changed this week</span>
        </div>
      </a>
      <a class="cms-col-3 cms-card is-interactive cms-link-card" href="#/?id=authors">
        <div class="cms-card-body cms-stat">
          <span class="cms-stat-label">Authors</span>
          <span class="cms-stat-value">4</span>
          <span class="cms-stat-hint">2 changed this week</span>
        </div>
      </a>
    </div>

    <section class="cms-section">
      <h2 class="cms-h3">Latest changes</h2>
      <div class="cms-datatable-scroll">
        <table class="cms-datatable is-hover">
          <tbody>
            <tr><td><a class="cms-link" href="#/?id=articles&record=…">Winter ferry timetable</a></td><td>Articles</td><td>Ana</td><td class="cms-text-muted">1 hour ago</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>
```

## Vuetify, and the kit

Both are first-class, and both read the same tokens. **Any Vuetify component works in a Vue plugin** (the plugin system doesn't limit them), at the Vuetify major the admin ships; a Vuetify major upgrade is announced as a plugin API change. Pick the kit when you want no framework, a lighter plugin, or a component that must look the same under any UI library.

| Vuetify | Kit |
|---|---|
| `v-card` | `cms-card` (`cms-card-header`, `-body`, `-footer`) |
| `v-btn` | `cms-btn` with `is-primary`, `is-secondary`, `is-tertiary`, `is-danger` |
| `v-btn-toggle` | `cms-toggle` |
| `v-table` | `cms-datatable-scroll` and `cms-datatable` |
| `v-chip` | `cms-chip`, `cms-badge` |
| `v-alert` | `cms-callout` |
| `v-divider` | `cms-divider` |
| `v-row` and `v-col` | `cms-grid` and `cms-col-*`, or `cms-row` |
| `v-list` and `v-list-item` | `cms-list` and `cms-list-item` |
| `v-text-field`, `v-select`, `v-textarea` | `cms-field` with `cms-input`, `cms-select`, `cms-textarea` |
| `v-progress-linear`, `v-progress-circular` | `cms-progress`, `cms-spinner` |
| `v-skeleton-loader` | `cms-skeleton` |

## How it reaches a plugin

- **Always loaded.** The admin loads the kit with the rest of its styles, so a page inside the admin can use the classes with no setup.
- **Shadow roots.** A plugin mounted in a shadow root (the isolation for non-Vue plugins) gets the kit from `await host.kitStyles()`, a constructable stylesheet to add to `shadowRoot.adoptedStyleSheets`. Custom properties cross the shadow boundary, so the theme comes along. It resolves to null where the browser has no constructable stylesheets.
- **Standalone pages.** `/admin/kit.css` serves the same CSS, tokens included in both palettes, for a page a plugin serves itself (a printable report, say) that wants the look without the admin around it. The build writes it as `dist/kit.css`.

## How it's kept honest

- **The reference page.** The Design system page draws every class and variant in both themes, so what's written here is what you can see.
- **The tests.** The test that guards the Design system reads the kit like any other style file: only tokens, no hard-coded colours, no `!important`. A second test checks that every class named on this page exists in the compiled kit, and one checks the text contrast of the token pairs the kit uses against AA in light and dark.

## What the kit isn't

It isn't a second component library to maintain beside Vuetify: it has no JavaScript and no behaviour. Anything that needs behaviour (a dialog that traps focus, a date picker, a virtualised list) stays in Vuetify, or in the admin's own components, and a plugin reaches it through the [host API](PLUGIN_SYSTEM_DESIGN.md#2-the-host-api) or `v-*` components.
