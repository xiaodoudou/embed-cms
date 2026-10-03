// A small cron: five fields (minute hour day-of-month month day-of-week), in the time zone of the server. It is enough to say when a
// sync runs; there is no seconds field and no names (use 1-12 and 0-6).
//
//   field          allowed values
//   minute         0-59
//   hour           0-23
//   day of month   1-31
//   month          1-12
//   day of week    0-6 (0 and 7 are Sunday)
//
// Each field takes `*`, a number, a range (`1-5`), a list (`1,15,30`) and a step (`*/10`, `0-30/5`, `5/15`).
// Like the cron of Unix, when both the day of month and the day of week are restricted, a day that fits either one is chosen.

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 }
]

const WHOLE_NUMBER = /^\d+$/

/**
 * The numbers one field stands for.
 * @param {string} text the field, such as `*\/5` or `1,15`
 * @param {{name: string, min: number, max: number}} field
 * @returns {Set<number>}
 */
function parseField (text, field) {
  const values = new Set()
  for (const part of text.split(',')) {
    const [range, stepText, extra] = part.split('/')
    if (range === '' || extra !== undefined || (stepText !== undefined && !WHOLE_NUMBER.test(stepText))) {
      throw new Error(`the ${field.name} "${text}" is not valid`)
    }
    const step = stepText === undefined ? 1 : Number(stepText)
    if (step < 1) {
      throw new Error(`the step of the ${field.name} "${text}" is at least 1`)
    }
    let from
    let to
    if (range === '*') {
      from = field.min
      to = field.max
    } else if (range.includes('-')) {
      const [low, high, more] = range.split('-')
      if (!WHOLE_NUMBER.test(low) || !WHOLE_NUMBER.test(high) || more !== undefined) {
        throw new Error(`the ${field.name} "${text}" is not valid`)
      }
      from = Number(low)
      to = Number(high)
    } else if (WHOLE_NUMBER.test(range)) {
      from = Number(range)
      // "5/15" means from 5 on, every 15
      to = stepText === undefined ? from : field.max
    } else {
      throw new Error(`the ${field.name} "${text}" is not valid`)
    }
    if (from < field.min || to > field.max || from > to) {
      throw new Error(`the ${field.name} "${text}" is out of range (${field.min}-${field.max})`)
    }
    for (let value = from; value <= to; value += step) {
      values.add(value)
    }
  }
  return values
}

/**
 * Reads a cron expression.
 * @param {string} expression five fields separated by spaces
 * @returns {{expression: string, minutes: Set<number>, hours: Set<number>, days: Set<number>, months: Set<number>, weekdays: Set<number>, anyDay: boolean, anyWeekday: boolean}}
 * @throws {Error} that says which field is wrong
 */
function parseCron (expression) {
  if (typeof expression !== 'string') {
    throw new Error('a cron expression is a text of five fields')
  }
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(`"${expression}" has ${parts.length} fields: a cron expression has five (minute hour day-of-month month day-of-week)`)
  }
  const [minutes, hours, days, months, weekdays] = parts.map((part, index) => parseField(part, FIELDS[index]))
  // 7 is Sunday too
  if (weekdays.delete(7)) {
    weekdays.add(0)
  }
  return {
    expression: parts.join(' '),
    minutes,
    hours,
    days,
    months,
    weekdays,
    anyDay: parts[2] === '*',
    anyWeekday: parts[4] === '*'
  }
}

const dayMatches = (cron, date) => {
  const dayOfMonth = cron.days.has(date.getDate())
  const dayOfWeek = cron.weekdays.has(date.getDay())
  if (cron.anyDay || cron.anyWeekday) {
    return (cron.anyDay || dayOfMonth) && (cron.anyWeekday || dayOfWeek)
  }
  return dayOfMonth || dayOfWeek
}

/**
 * The first time after `from` that the expression fires, to the minute.
 * @param {string|object} expression a cron expression, or what parseCron answered
 * @param {Date|number} [from] defaults to now
 * @returns {Date|null} null when it never fires in the next five years (such as the 31st of February)
 */
function nextRun (expression, from = new Date()) {
  const cron = typeof expression === 'string' ? parseCron(expression) : expression
  const date = new Date(from instanceof Date ? from.getTime() : from)
  date.setSeconds(0, 0)
  date.setMinutes(date.getMinutes() + 1)
  const limit = date.getFullYear() + 5
  while (date.getFullYear() <= limit) {
    if (!cron.months.has(date.getMonth() + 1)) {
      date.setMonth(date.getMonth() + 1, 1)
      date.setHours(0, 0, 0, 0)
    } else if (!dayMatches(cron, date)) {
      date.setDate(date.getDate() + 1)
      date.setHours(0, 0, 0, 0)
    } else if (!cron.hours.has(date.getHours())) {
      date.setHours(date.getHours() + 1, 0, 0, 0)
    } else if (!cron.minutes.has(date.getMinutes())) {
      date.setMinutes(date.getMinutes() + 1, 0, 0)
    } else {
      return date
    }
  }
  return null
}

module.exports = { parseCron, nextRun }
