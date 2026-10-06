const express = require('express')
class ExpressManager {
  constructor () {
    this.app = express()
  }
  /** @returns {import('express').Express} the app of the plugin, to mount */
  express = () => {
    return this.app
  }
}
exports = module.exports = ExpressManager
