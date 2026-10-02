/**
 * Runs at most `concurrency` tasks at a time; the others wait in line. A line longer than `maxQueue` is refused
 * with an error, so a flood of requests cannot pile up work (and the memory it holds) without end.
 */
class Limiter {
  /**
   * @param {number} concurrency - tasks running at once, 0 or less for no limit
   * @param {number} [maxQueue] - tasks allowed to wait, Infinity for any number
   */
  constructor (concurrency, maxQueue = Infinity) {
    this.concurrency = concurrency
    this.maxQueue = maxQueue
    this.running = 0
    this.queue = []
  }

  /**
   * @template T
   * @param {function(): Promise<T>} task
   * @returns {Promise<T>}
   */
  run (task) {
    if (!(this.concurrency > 0)) {
      return task()
    }
    return new Promise((resolve, reject) => {
      const start = () => {
        this.running++
        Promise.resolve().then(task).then(resolve, reject).finally(() => {
          this.running--
          const next = this.queue.shift()
          if (next) {
            next()
          }
        })
      }
      if (this.running < this.concurrency) {
        start()
      } else if (this.queue.length < this.maxQueue) {
        this.queue.push(start)
      } else {
        reject(Object.assign(new Error('Too many image operations waiting, try again later'), { code: 503 }))
      }
    })
  }
}

module.exports = Limiter
