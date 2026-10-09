import _ from 'lodash'

/**
 * Splits a text into matched and unmatched parts for a search highlight, without touching innerHTML.
 * The match is case-insensitive and highlights every occurrence; an empty query returns the text as one part.
 */
export function highlightSegments (text, query) {
  const source = _.toString(text)
  const needle = _.toLower(_.trim(_.toString(query)))
  if (!needle) {
    return [{ text: source, match: false }]
  }
  const lower = _.toLower(source)
  const parts = []
  let cursor = 0
  let index = lower.indexOf(needle, cursor)
  while (index !== -1) {
    if (index > cursor) {
      parts.push({ text: source.slice(cursor, index), match: false })
    }
    parts.push({ text: source.slice(index, index + needle.length), match: true })
    cursor = index + needle.length
    index = lower.indexOf(needle, cursor)
  }
  if (cursor < source.length) {
    parts.push({ text: source.slice(cursor), match: false })
  }
  return parts.length > 0 ? parts : [{ text: source, match: false }]
}

/**
 * Options grouped under headings: items are sorted by their group (empty groups last) and a subheader entry
 * precedes each group, the shape Vuetify lists understand.
 */
export function withGroupHeadings (items, groupOf) {
  const groups = _.groupBy(items, (item) => _.toString(groupOf(item)))
  const names = _.sortBy(_.keys(groups), (name) => (name === '' ? 1 : 0))
  if (names.length <= 1 && names[0] === '') {
    return items
  }
  return _.flatMap(names, (name) => (name === '' ? groups[name] : [{ type: 'subheader', title: name }, ...groups[name]]))
}

