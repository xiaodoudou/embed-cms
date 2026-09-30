// Legacy HTTP integration suite: runs against the server started by test/server.js.
// Only require test files, do not initialize CMS or SmartCrop here.
// New tests belong in test/unit (see docs/TESTING.md); the xlsx, sync, import and importFromRemote
// suites live there now.
require('./authentication.test.js')
require('./resource.test.js')
require('./helpers.test.js')
require('./anonymousRead.test.js')
require('./db.test.js')
require('./api_routes.test.js')
require('./smart-cropping.test.js')

// needs peer processes: run with RUN_PEER_TESTS=1
// require('./replicator.test.js')
