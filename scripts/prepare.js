#!/usr/bin/env node
// Builds the admin app (dist/) when it is missing. npm runs this `prepare` script when it installs embed-cms from git (after
// installing the dev dependencies the build needs) and before it packs it, and in a clone on the first `npm install`, so
// embed-cms always arrives with its admin built. dist/ is not in git. EMBED_CMS_SKIP_BUILD=1 skips it.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')

if (process.env.EMBED_CMS_SKIP_BUILD) {
  console.log('embed-cms: EMBED_CMS_SKIP_BUILD is set, the admin app was not built')
  process.exit(0)
}
if (fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.log('embed-cms: the admin app is already built (dist/), run npm run build to rebuild it')
  process.exit(0)
}
try {
  require.resolve('vite/package.json', { paths: [root] })
} catch {
  // installed without its dev dependencies (npm install --omit=dev): the CMS still runs, the admin answers 503 until built
  console.warn('embed-cms: vite is not installed, so the admin app was not built. Run npm run build in embed-cms.')
  process.exit(0)
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
process.exit(result.status === null ? 1 : result.status)
