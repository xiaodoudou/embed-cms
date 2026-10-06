const { expect } = require('chai')
const { parseCron, nextRun } = require('../../lib/util/cron')

// dates are made in the time zone of the machine, as the cron reads them
const at = (year, month, day, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute, 0, 0)
const next = (expression, from) => nextRun(expression, from)

describe('cron (unit)', () => {
  describe('parseCron', () => {
    it('reads stars, numbers, ranges, lists and steps', () => {
      const cron = parseCron('*/15 8-10 1,15 * 1-5')
      expect([...cron.minutes]).to.deep.equal([0, 15, 30, 45])
      expect([...cron.hours]).to.deep.equal([8, 9, 10])
      expect([...cron.days]).to.deep.equal([1, 15])
      expect([...cron.months]).to.have.length(12)
      expect([...cron.weekdays]).to.deep.equal([1, 2, 3, 4, 5])
    })

    it('reads a step from a number, and a step in a range', () => {
      expect([...parseCron('5/20 * * * *').minutes]).to.deep.equal([5, 25, 45])
      expect([...parseCron('0-30/10 * * * *').minutes]).to.deep.equal([0, 10, 20, 30])
    })

    it('takes 7 for Sunday as well as 0', () => {
      expect([...parseCron('0 0 * * 7').weekdays]).to.deep.equal([0])
      expect([...parseCron('0 0 * * 0,7').weekdays]).to.deep.equal([0])
    })

    it('tolerates extra spaces and keeps a clean copy of the expression', () => {
      expect(parseCron('  0   3  * *  *  ').expression).to.equal('0 3 * * *')
    })

    it('says which field is wrong', () => {
      expect(() => parseCron('0 3 * *')).to.throw(/4 fields.*five/)
      expect(() => parseCron('0 3 * * * *')).to.throw(/6 fields/)
      expect(() => parseCron('60 * * * *')).to.throw(/minute.*out of range \(0-59\)/)
      expect(() => parseCron('* 24 * * *')).to.throw(/hour.*out of range \(0-23\)/)
      expect(() => parseCron('* * 0 * *')).to.throw(/day of month.*out of range \(1-31\)/)
      expect(() => parseCron('* * * 13 *')).to.throw(/month.*out of range \(1-12\)/)
      expect(() => parseCron('* * * * 8')).to.throw(/day of week.*out of range \(0-7\)/)
      expect(() => parseCron('5-1 * * * *')).to.throw(/out of range/)
      expect(() => parseCron('*/0 * * * *')).to.throw(/step.*at least 1/)
      expect(() => parseCron('a * * * *')).to.throw(/minute.*not valid/)
      expect(() => parseCron('1-2-3 * * * *')).to.throw(/not valid/)
      expect(() => parseCron('1//2 * * * *')).to.throw(/not valid/)
      expect(() => parseCron('1, * * * *')).to.throw(/not valid/)
      expect(() => parseCron('mon * * * *')).to.throw(/not valid/)
    })

    it('refuses what is not a text', () => {
      expect(() => parseCron(undefined)).to.throw(/five fields/)
      expect(() => parseCron(5)).to.throw(/five fields/)
    })
  })

  describe('nextRun', () => {
    it('answers the next minute for every minute, never the minute it is asked in', () => {
      expect(next('* * * * *', at(2026, 10, 3, 14, 20)).getTime()).to.equal(at(2026, 10, 3, 14, 21).getTime())
      // seconds do not count
      const withSeconds = at(2026, 10, 3, 14, 20)
      withSeconds.setSeconds(59, 999)
      expect(next('* * * * *', withSeconds).getTime()).to.equal(at(2026, 10, 3, 14, 21).getTime())
    })

    it('finds a time of the day, today when it is still to come and tomorrow when it is past', () => {
      expect(next('0 3 * * *', at(2026, 10, 3, 1, 0)).getTime()).to.equal(at(2026, 10, 3, 3, 0).getTime())
      expect(next('0 3 * * *', at(2026, 10, 3, 3, 0)).getTime()).to.equal(at(2026, 10, 4, 3, 0).getTime())
      expect(next('0 3 * * *', at(2026, 10, 3, 14, 0)).getTime()).to.equal(at(2026, 10, 4, 3, 0).getTime())
    })

    it('follows steps', () => {
      expect(next('*/30 * * * *', at(2026, 10, 3, 14, 5)).getTime()).to.equal(at(2026, 10, 3, 14, 30).getTime())
      expect(next('*/30 * * * *', at(2026, 10, 3, 14, 30)).getTime()).to.equal(at(2026, 10, 3, 15, 0).getTime())
    })

    it('finds a day of the week (3 October 2026 is a Saturday)', () => {
      // Monday to Friday at 9
      expect(next('0 9 * * 1-5', at(2026, 10, 3, 12, 0)).getTime()).to.equal(at(2026, 10, 5, 9, 0).getTime())
      // Sunday, written 0 and 7
      expect(next('0 0 * * 0', at(2026, 10, 3, 12, 0)).getTime()).to.equal(at(2026, 10, 4, 0, 0).getTime())
      expect(next('0 0 * * 7', at(2026, 10, 3, 12, 0)).getTime()).to.equal(at(2026, 10, 4, 0, 0).getTime())
    })

    it('finds a day of the month, and a month', () => {
      expect(next('0 0 1 * *', at(2026, 10, 3)).getTime()).to.equal(at(2026, 11, 1).getTime())
      expect(next('30 6 15 3 *', at(2026, 10, 3)).getTime()).to.equal(at(2027, 3, 15, 6, 30).getTime())
    })

    it('crosses the end of the month and of the year', () => {
      expect(next('0 0 * * *', at(2026, 12, 31, 23, 59)).getTime()).to.equal(at(2027, 1, 1).getTime())
      expect(next('0 12 29 2 *', at(2026, 3, 1)).getTime()).to.equal(at(2028, 2, 29, 12, 0).getTime())
    })

    it('takes a day that fits the day of the month or the day of the week when both are restricted, as Unix does', () => {
      // the 13th, or a Friday: from Saturday 3 October 2026 the next such day is the Friday the 9th, then the 13th
      expect(next('0 0 13 * 5', at(2026, 10, 3)).getTime()).to.equal(at(2026, 10, 9).getTime())
      expect(next('0 0 13 * 5', at(2026, 10, 10)).getTime()).to.equal(at(2026, 10, 13).getTime())
    })

    it('answers null for a day that does not exist', () => {
      expect(next('0 0 31 2 *', at(2026, 1, 1))).to.equal(null)
      expect(next('0 0 30 2 *', at(2026, 1, 1))).to.equal(null)
    })

    it('takes what parseCron answered as well as a text, and a number of milliseconds as a start', () => {
      expect(nextRun(parseCron('0 3 * * *'), at(2026, 10, 3, 1)).getTime()).to.equal(at(2026, 10, 3, 3).getTime())
      expect(nextRun('0 3 * * *', at(2026, 10, 3, 1).getTime()).getTime()).to.equal(at(2026, 10, 3, 3).getTime())
    })

    it('gives a time that always comes after the start and fits the expression', () => {
      let from = at(2026, 1, 1)
      for (let count = 0; count < 200; count++) {
        const found = next('7,37 */5 * * 1-5', from)
        expect(found.getTime()).to.be.greaterThan(from.getTime())
        expect([7, 37]).to.include(found.getMinutes())
        expect(found.getHours() % 5).to.equal(0)
        expect(found.getDay()).to.be.within(1, 5)
        from = found
      }
    })
  })
})
