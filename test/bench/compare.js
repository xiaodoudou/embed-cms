/**
 * Prints two benchmark results (from `bench.js --json`) side by side as a markdown table.
 *
 *   node test/bench/compare.js before.json after.json
 */
const fs = require('fs')

const [beforeFile, afterFile] = process.argv.slice(2)
if (!beforeFile || !afterFile) {
  console.error('usage: node test/bench/compare.js before.json after.json')
  process.exit(1)
}
const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'))
const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'))

// the number a result stands for, and whether a lower one is better
const measure = (name, value) => {
  if (typeof value === 'number') {
    return { value, lowerIsBetter: !/per_s|req/i.test(name) }
  }
  if (value && typeof value === 'object') {
    for (const key of ['ms', 'reqPerSecond', 'totalMs']) {
      if (key in value) {
        return { value: value[key], lowerIsBetter: key !== 'reqPerSecond' }
      }
    }
  }
  return undefined
}

const rows = []
const collect = (label, a, b) => {
  for (const name of Object.keys(a || {})) {
    const left = measure(name, a[name])
    const right = measure(name, (b || {})[name])
    if (left && right) {
      const ratio = left.lowerIsBetter ? left.value / right.value : right.value / left.value
      rows.push({ label, name, before: left.value, after: right.value, ratio })
    }
    for (const extra of ['peakRssDeltaMb', 'eventLoopMaxMs', 'eventLoopP99Ms']) {
      if (a[name] && typeof a[name] === 'object' && extra in a[name] && b && b[name] && extra in b[name]) {
        rows.push({ label, name: `${name}.${extra}`, before: a[name][extra], after: b[name][extra], ratio: a[name][extra] / Math.max(b[name][extra], 0.001) })
      }
    }
  }
}
for (const size of before.sizes || []) {
  collect(`${size} records`, before[size], after[size])
}
for (const group of ['basicAuth', 'attachments', 'images']) {
  if (before[group] && after[group]) {
    for (const name of Object.keys(before[group])) {
      if (typeof before[group][name] === 'object') {
        collect(group, { [name]: before[group][name] }, { [name]: after[group][name] })
      } else {
        collect(group, { [name]: before[group][name] }, { [name]: after[group][name] })
      }
    }
  }
}
console.log('| scenario | measure | before | after | better by |')
console.log('|---|---|---:|---:|---:|')
for (const row of rows) {
  console.log(`| ${row.label} | ${row.name} | ${row.before} | ${row.after} | ${Math.round(row.ratio * 10) / 10}x |`)
}
