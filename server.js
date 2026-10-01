#!/usr/bin/env node

const express = require('express')
const CMS = require('./')
const pkg = require('./package.json')
const logger = require('./lib/logger')
const { cliOptions } = require('./lib/cliOptions')

// the development harness in a clone of embed-cms, the project's own cms.json anywhere else
const options = cliOptions(process.cwd(), __dirname)
const cms = new CMS(options)

const app = express()
app.use(cms.express())
const server = app.listen(process.env.PORT || pkg.config.port, async () => {
  await cms.bootstrap(server)
  logger.info('########### server started ###########')
  return logger.info(`${pkg.name} started at http://localhost:${server.address().port}/admin`)
})

process.on('uncaughtException', (error) => {
  logger.error(error)
})

process
  .on('SIGTERM', cms.shutdown('SIGTERM'))
  .on('SIGINT', cms.shutdown('SIGINT'))
  .on('uncaughtException', cms.shutdown('uncaughtException'))
