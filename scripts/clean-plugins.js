#!/usr/bin/env node
// Empties src/plugins before the dev server starts (the `dev` script runs it). The build points that path at the plugins of the project (a symlink, see
// vite.utils.js) or leaves a copy there; both are made again at the next start. A symlink is removed, never followed: what it points to is not touched.
const fs = require('fs')
const path = require('path')

fs.rmSync(path.resolve(__dirname, '..', 'src', 'plugins'), { recursive: true, force: true })
