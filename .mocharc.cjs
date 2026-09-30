module.exports = {
  exit: true,
  timeout: 15000,
  reporter: 'spec',
  // Some machines drop the first packet to a freshly opened local port (about 1 connection in 100 on one Windows
  // developer machine, with no CMS code involved), which fails a random test with ETIMEDOUT. MOCHA_RETRIES=2 runs a
  // failing test again there; CI leaves it unset so a real flaky test stays visible.
  retries: Number(process.env.MOCHA_RETRIES || 0)
}
