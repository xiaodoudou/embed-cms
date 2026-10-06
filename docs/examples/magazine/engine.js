// The template engine of the magazine: lodash templates, compiled once and compiled again when their file changes.
//
// Express asks an engine for a function (file, data, callback). This one is about thirty lines: it keeps the compiled template of each file with the modification date it had, so a
// request costs one `stat` and a call, and an edited file shows at the next request. A template can call `include('partials/card', { article })` for a piece shared by pages.
//
// `<%- value %>` prints the value escaped, `<%= value %>` prints it raw (only for HTML an editor of yours wrote), `<% code %>` runs JavaScript. Templates are files of the project,
// never text from a record: lodash compiles them into functions, which is code.
const fs = require('fs')
const path = require('path')
const _ = require('lodash')

/**
 * @param {object} options
 * @param {string} options.views the folder of the templates (`*.html`)
 * @returns {function(string, object, function): void} an Express engine, for `app.engine('html', engine)`
 */
module.exports = function createEngine ({ views }) {
  /** @type {Map<string, {mtimeMs: number, render: function}>} */
  const compiled = new Map()

  /**
   * @param {string} file
   * @returns {function(object): string} the compiled template; a file with another date is compiled again
   */
  const load = (file) => {
    const { mtimeMs } = fs.statSync(file)
    const known = compiled.get(file)
    if (known && known.mtimeMs === mtimeMs) {
      return known.render
    }
    // sourceURL names the file in an error of the template
    const render = _.template(fs.readFileSync(file, 'utf8'), { sourceURL: file })
    compiled.set(file, { mtimeMs, render })
    return render
  }

  return (file, data, callback) => {
    try {
      const include = (name, extra = {}) => load(path.join(views, `${name}.html`))({ ...data, ...extra, include })
      callback(null, load(file)({ ...data, include }))
    } catch (error) {
      callback(error)
    }
  }
}
