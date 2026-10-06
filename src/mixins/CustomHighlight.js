import javascript from 'highlight.js/lib/languages/javascript'

/**
 * @param {Object} hljs
 * @returns {Object} the javascript language with rules of our own
 */
export default function customJavaScript(hljs){
  const base = javascript(hljs)

  base.contains.unshift(
    {
      className: 'operator',
      match: /(===|!==|==|!=|!|<=|>=|=>|--|\+|-|\*|\/|%|=|<|>|\||&|\^|~|\?)/
    },
    {
      className: 'variable',
      match: /(_)/
    },
    {
      className: 'keyword',
      match: /this/
    }
  )

  return base
}
