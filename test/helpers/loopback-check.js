// Diagnoses a machine that drops connections to freshly opened local ports (see docs/TESTING.md): opens 300 small
// servers one after the other and connects to each. A healthy machine prints only "ok". Run: node test/helpers/loopback-check.js
const http = require('http')
async function once (host) {
  const server = http.createServer((req, res) => res.end('ok'))
  await new Promise((r) => server.listen(0, r))
  const port = server.address().port
  const t0 = Date.now()
  const result = await new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: 3000, agent: false }, (res) => { res.resume(); res.on('end', () => resolve('ok')) })
    req.on('timeout', () => { req.destroy(); resolve('timeout') })
    req.on('error', (e) => resolve(e.code || e.message))
  })
  await new Promise((r) => server.close(r))
  return { result, ms: Date.now() - t0 }
}
;(async () => {
  for (const host of ['localhost', '127.0.0.1']) {
    const counts = {}
    let slow = 0
    for (let i = 0; i < 300; i++) {
      const { result, ms } = await once(host)
      counts[result] = (counts[result] || 0) + 1
      if (ms > 500) slow++
    }
    console.log(host, JSON.stringify(counts), 'slow(>500ms):', slow)
  }
})()
