// paragraph with dynamicLayout: the blocks of a paragraph field sit side by side, in a grid (see paragraphs/tile_*.js)
module.exports = {
  displayname: { enUS: 'Grid layouts', zhCN: '网格布局' },
  group: { enUS: 'Structured', zhCN: '结构化' },
  locales: ['enUS', 'zhCN'],
  type: 'normal',
  schema: [
    { field: 'name', input: 'string', label: 'Name', localised: false, required: true, options: { hint: 'Required. Names the record in lists' } },
    // Half tiles: 2 per row, so four tiles make 2 by 2
    { field: 'twoByTwo', input: 'paragraph', label: '2 by 2', localised: false, options: { types: ['tile_half'], dynamicLayout: true, hint: 'Half tiles: add four for a 2 by 2 grid' } },
    // Third tiles: 3 per row, so nine tiles make 3 by 3
    { field: 'threeByThree', input: 'paragraph', label: '3 by 3', localised: false, options: { types: ['tile_third'], dynamicLayout: true, hint: 'Third tiles: add nine for a 3 by 3 grid' } },
    // Quarter tiles: 4 per row
    { field: 'fourByTwo', input: 'paragraph', label: '4 by 2', localised: false, options: { types: ['tile_quarter'], dynamicLayout: true, hint: 'Quarter tiles: add eight for 4 by 2' } },
    // Several tile types in one paragraph: a row of 12 slots can mix them (6 + 3 + 3, then 4 + 4 + 4)
    { field: 'mixed', input: 'paragraph', label: 'Mixed', localised: false, options: { types: ['tile_half', 'tile_third', 'tile_quarter'], dynamicLayout: true, hint: 'Mix the tile sizes: the row wraps when it is full' } }
  ]
}
