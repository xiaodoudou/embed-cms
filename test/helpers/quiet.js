// Loaded by .mocharc.cjs before any test: the CMS logs every refused request, failed login and boot warning, which
// buries the test results in expected noise. TEST_LOGS=1 (or any LOG_LEVEL) brings the log lines back.
const logger = require('../../lib/logger')

if (!process.env.TEST_LOGS && !process.env.LOG_LEVEL) {
  logger.level = 'silent'
}
