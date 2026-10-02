const routes = require('./routes')
const mw = {
  authorize: require('./middleware/authorize'),
  find_resource: require('./middleware/findResource'),
  list_resources: require('./middleware/listResources'),
  parse_query: require('./middleware/parseQuery')
}

/*
 * Constructor
 *
 */
class RestHelper  {
  constructor () {
    this.mw = mw
    this.routes = routes
  }
}

exports = module.exports = RestHelper
