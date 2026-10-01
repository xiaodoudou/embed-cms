# Dynamic layout for paragraph fields

A [paragraph field](fields/paragraph.md) normally stacks its blocks one under the other. With dynamic layout the blocks
sit side by side in the editor, each taking a share of the width, the way they will on the page. It helps editors who
build a row of cards, a gallery or a report line, because they see the arrangement while they write.

This is an editing aid only. It changes how the admin draws the blocks; what is stored, and how your site renders it,
is up to you.

## How widths are computed

Think of a 12-column grid. Each block takes a number of **slots**, and the row has a number of slots too:

- A block's slots come from a `slots` value in the block itself (a field named `slots` in its paragraph type). If the
  block has none, the paragraph type's `layout.slots` is used, then 2.
- The row's slots come from a `slots` value on the record (or the block) that holds the paragraph field, or 12.

A block is `slots / rowSlots` of the width, minus its share of the 16px gaps. Blocks wrap when a row is full: in an
8-slot row, blocks of 3 + 3 + 3 put two on the first line and one on the second. On screens 768px wide or narrower every
block takes the full width.

## Turning it on

It switches on by itself as soon as one block has a `slots` value. You can also turn it on explicitly with
`options.dynamicLayout: true` on the paragraph field, so blocks without `slots` (2 slots each) are laid out too.

```js
// resources/paragraphs/card.js: a paragraph type whose blocks choose their width
module.exports = {
  displayname: 'Card',
  schema: [
    { field: 'title', input: 'string', label: 'Title', required: true },
    { field: 'image', input: 'image', label: 'Image' },
    { field: 'slots', input: 'integer', label: 'Width (of 12)', options: { min: 1, max: 12 } }
  ]
}
```

```js
// resources/landing.js
module.exports = {
  displayname: 'Landing pages',
  schema: [
    { field: 'title', input: 'string', label: 'Title' },
    { field: 'cards', input: 'paragraph', label: 'Cards', options: { types: ['card'], dynamicLayout: true } }
  ]
}
```

An editor who adds three cards with widths 3, 6 and 3 sees them on one line at 25%, 50% and 25%.

## Things to know

- Each block shows a small badge at its top, such as `2/3`. That is its **position** among the blocks, not its width
  ([UI_BUGS.md](UI_BUGS.md#layout-and-display)).
- Between 769 and 1024px a rule meant to widen narrow blocks only matches 3-slot blocks
  ([BUGS.md](BUGS.md#authentication-and-admin)).
- Keep each block's slots at or below the row's, or the block takes a whole line.
- The layout lives in `src/components/fields/ParagraphView.vue` (`isDynamicLayoutContainer`, `getItemStyles`).
