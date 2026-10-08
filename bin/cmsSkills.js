#!/usr/bin/env node

// Copies the agent skills of embed-cms into the skills folder of an agent (see lib/util/skillsCli.js, and skills/README.md)
const { main } = require('../lib/util/skillsCli')

process.exitCode = main(process.argv.slice(2))
