/**
 * Row arithmetic for the syslog page when long lines are wrapped. The list is virtual (only the visible lines are in
 * the page), so every line needs a known height: rows of text times the row height.
 */

export const ROW_HEIGHT = 20

/** How many characters of a monospace font fit in a width (at least `minimum`) */
export function columnsFor (widthPx, charWidthPx, minimum = 10) {
  if (!(widthPx > 0) || !(charWidthPx > 0)) {
    return minimum
  }
  return Math.max(minimum, Math.floor(widthPx / charWidthPx))
}

/** How many rows a line of text takes in a given number of columns (an empty line still takes one) */
export function rowsFor (text, columns) {
  const length = String(text === null || text === undefined ? '' : text).length
  return Math.max(1, Math.ceil(length / Math.max(1, columns)))
}

/** The lines with the height each one needs (`rowHeight`), for the virtual list */
export function withRowHeights (lines, columns, textOf = (line) => line.line) {
  return lines.map((line) => ({ ...line, rowHeight: rowsFor(textOf(line), columns) * ROW_HEIGHT }))
}
