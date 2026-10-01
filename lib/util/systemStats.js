const os = require('os')
const { OSUtils } = require('node-os-utils')

// What the System page of the admin reads (src/components/SystemInfo.vue) is the shape node-os-utils 1 returned:
//   cpu { count, usage, model }, memory { totalMemMb, usedMemMb, freeMemMb, freeMemPercentage },
//   drive { totalGb, usedGb, usedPercentage }, network { total: { inputMb, outputMb } }
// node-os-utils 3 wraps every result as { success, data } with byte counts, so these functions map it back. They are pure:
// the collector below is the only part that talks to the operating system.

const MB = 1024 * 1024
const GB = 1024 * MB
const NOT_SUPPORTED = 'not supported'

const dataOf = (result) => (result && result.success ? result.data : undefined)
const bytesOf = (value) => (value && typeof value.bytes === 'number' ? value.bytes : 0)
const round = (value) => Math.round(value * 100) / 100

function memoryShape (info) {
  const total = bytesOf(info && info.total)
  if (!total) {
    return 0
  }
  const free = bytesOf(info.available) || bytesOf(info.free)
  return {
    totalMemMb: round(total / MB),
    usedMemMb: round(bytesOf(info.used) / MB),
    freeMemMb: round(free / MB),
    freeMemPercentage: round((free / total) * 100)
  }
}

// a path in one form for comparing: forward slashes, lower case (drive letters), no trailing slash
const normalised = (value) => String(value).replace(/\\/g, '/').toLowerCase().replace(/(.)\/+$/, '$1')
// a mount point holds a folder when it is that folder or one of its parents, whole names only ("/data" does not hold "/database")
const holds = (mountpoint, folder) => {
  const mount = normalised(mountpoint)
  return folder === mount || folder.startsWith(mount.endsWith('/') ? mount : `${mount}/`)
}

// the drive that holds the working directory (the data lives next to it); the longest matching mount point wins
function driveShape (disks, cwd = process.cwd()) {
  if (!Array.isArray(disks) || disks.length === 0) {
    return NOT_SUPPORTED
  }
  const here = normalised(cwd)
  const holding = disks
    .filter((disk) => disk.mountpoint && holds(disk.mountpoint, here))
    .sort((a, b) => normalised(b.mountpoint).length - normalised(a.mountpoint).length)
  const disk = holding[0] || disks[0]
  const total = bytesOf(disk.total)
  if (!total) {
    return NOT_SUPPORTED
  }
  const used = bytesOf(disk.used)
  return { totalGb: round(total / GB), usedGb: round(used / GB), usedPercentage: round((used / total) * 100) }
}

function networkShape (overview) {
  if (!overview || typeof overview.totalRxBytes === 'undefined') {
    return NOT_SUPPORTED
  }
  const inputMb = round(bytesOf(overview.totalRxBytes) / MB)
  const outputMb = round(bytesOf(overview.totalTxBytes) / MB)
  // the exact counters are kept too: the rounded megabytes cannot show a rate of a few kilobytes a second
  return { total: { inputMb, outputMb }, inputMb, outputMb, inputBytes: bytesOf(overview.totalRxBytes), outputBytes: bytesOf(overview.totalTxBytes) }
}

/**
 * Adds the live traffic to a report: the bytes sent and received per second since the previous report. The counters of the
 * system only ever grow (they are the total since boot); node-os-utils has no rate on Windows, so it is worked out here.
 * @param {object} report - what collectSystem returned
 * @param {{inputBytes?: number, outputBytes?: number, at?: number}} state - kept by the caller between two reports
 * @param {number} [now] - milliseconds
 * @returns {object} the report, with network.rate = { inputBytesPerSec, outputBytesPerSec } (null on the first report)
 */
function withNetworkRate (report, state, now = Date.now()) {
  const network = report && report.network
  if (!network || typeof network.inputBytes !== 'number') {
    return report
  }
  const seen = typeof state.at === 'number'
  const seconds = seen ? (now - state.at) / 1000 : 0
  // a counter that went back (a network card reset, a reboot) or two reports at the same time: no rate this time
  const rate = seen && seconds > 0 && network.inputBytes >= state.inputBytes && network.outputBytes >= state.outputBytes
    ? { inputBytesPerSec: Math.round((network.inputBytes - state.inputBytes) / seconds), outputBytesPerSec: Math.round((network.outputBytes - state.outputBytes) / seconds) }
    : null
  state.inputBytes = network.inputBytes
  state.outputBytes = network.outputBytes
  state.at = now
  network.rate = rate
  return report
}

function cpuShape (usage, cpus = os.cpus()) {
  return {
    count: cpus.length,
    usage: typeof usage === 'number' ? usage : 0,
    model: (cpus[0] && cpus[0].model) || 'Unknown'
  }
}

// a value that cannot be read on this machine becomes its default instead of failing the whole report
const orDefault = async (read, fallback) => {
  try {
    const value = await read()
    return typeof value === 'undefined' ? fallback : value
  } catch {
    return fallback
  }
}

/**
 * Reads the system and returns the shape above. `monitor` and `host` can be replaced (tests do).
 */
async function collectSystem ({ monitor = new OSUtils(), host = { cpus: os.cpus(), cwd: process.cwd() } } = {}) {
  // each read can take a while (on Windows they start a shell): together, not one after the other
  const [usage, memory, drive, network] = await Promise.all([
    orDefault(async () => dataOf(await monitor.cpu.usage()), 0),
    orDefault(async () => memoryShape(dataOf(await monitor.memory.info())), 0),
    orDefault(async () => driveShape(dataOf(await monitor.disk.usage()), host.cwd), NOT_SUPPORTED),
    orDefault(async () => networkShape(dataOf(await monitor.network.overview())), NOT_SUPPORTED)
  ])
  return { cpu: cpuShape(usage, host.cpus), memory, network, drive, uptime: Math.floor(process.uptime()) }
}

module.exports = { collectSystem, withNetworkRate, memoryShape, driveShape, networkShape, cpuShape }
