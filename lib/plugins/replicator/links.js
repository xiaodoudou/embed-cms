const _ = require('lodash')
const logger = require('../../logger')

// How long a link waits before it connects again after a failure: it grows with each failure in a row, up to the last one
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000]
// How long the files of received records wait, so that a burst of records fetches its files once
const FILES_DELAY = 500
// How often a store that cannot stay live (MongoDB, PostgreSQL) is asked again for its changes
const DEFAULT_POLL_INTERVAL = 30000

/**
 * A live link: this node pulls one resource from one peer. It connects, takes what it lacks, then each change as the
 * peer writes it, and fetches the files of the records it received. When the connection drops it connects again, after
 * a delay that grows while it keeps failing. A store that cannot stay live ends the exchange once it has sent what it
 * has: the link asks again after `pollInterval`.
 */
class Link {
  /**
   * @param {object} replicator the Replicator of this node
   * @param {string} name the resource
   * @param {{url: string, direction?: string}} peer
   * @param {{pollInterval?: number}} [options]
   */
  constructor (replicator, name, peer, options = {}) {
    this.replicator = replicator
    this.name = name
    this.peer = peer
    this.pollInterval = _.isNumber(options.pollInterval) && options.pollInterval > 0 ? options.pollInterval : DEFAULT_POLL_INTERVAL
    this.running = false
    this.failures = 0
    this.state = 'stopped'
    this.error = null
    this.since = null
    this.retryAt = null
    this.received = 0
    this.lastReceivedAt = null
    // the machine id of the peer, learnt at the first connection: the page names the peer the same way on both sides
    this.peerId = null
    this.socket = null
    this.wake = null
    this.filesTimer = null
    this.filesRunning = null
  }

  /** Starts the link; it runs until stop(). */
  start () {
    if (this.running) {
      return
    }
    this.running = true
    this.done = this.run().catch((error) => logger.error(`Replication link ${this.name} failed:`, error))
  }

  /**
   * Stops the link and drops its connection.
   * @returns {Promise<void>}
   */
  async stop () {
    this.running = false
    clearTimeout(this.filesTimer)
    if (this.socket) {
      this.socket.destroy()
    }
    if (this.wake) {
      this.wake()
    }
    await this.done
    // a fetch of files that is under way ends before the link says it stopped
    while (this.filesRunning) {
      await this.filesRunning
    }
    this.state = 'stopped'
  }

  /** Connects again now: what the peer has that this node lacks comes in first. */
  restart () {
    this.failures = 0
    if (this.socket) {
      this.socket.destroy()
    }
    if (this.wake) {
      this.wake()
    }
  }

  /**
   * Waits, unless stop() or restart() comes first.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep (ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms)
      function done () {
        clearTimeout(timer)
        resolve()
      }
      this.wake = done
    }).finally(() => { this.wake = null })
  }

  /** The loop of the link: connect, pull, and connect again. */
  async run () {
    while (this.running) {
      this.state = this.failures ? 'reconnecting' : 'connecting'
      try {
        const { socket, remoteId } = await this.replicator.connect(this.peer, this.name)
        if (!this.running) {
          socket.destroy()
          break
        }
        const resource = this.replicator.cms.resource(this.name)
        const live = resource.json.supportsLive
        this.socket = socket
        this.peerId = remoteId
        this.failures = 0
        this.error = null
        this.retryAt = null
        this.since = Date.now()
        this.state = live ? 'live' : 'polling'
        const failure = await resource.json.sync(socket, true, this.replicator.passRemoteId ? remoteId : null, {
          pull: true,
          push: false,
          live,
          onReceived: () => this.onReceived()
        })
        this.socket = null
        if (failure) {
          throw failure
        }
        await this.fetchFiles()
        if (!this.running) {
          break
        }
        if (live) {
          throw new Error('The peer closed the connection')
        }
        // a store that sent what it had: ask again after a while
        this.state = 'waiting'
        this.retryAt = Date.now() + this.pollInterval
        await this.sleep(this.pollInterval)
      } catch (error) {
        this.socket = null
        if (!this.running) {
          break
        }
        const delay = RETRY_DELAYS[Math.min(this.failures, RETRY_DELAYS.length - 1)]
        this.failures += 1
        this.state = 'reconnecting'
        this.error = error.message || String(error)
        this.retryAt = Date.now() + delay
        logger.warn(`Replication of ${this.name} from ${this.peer.url}: ${this.error}; connecting again in ${delay / 1000}s`)
        await this.sleep(delay)
      }
    }
  }

  /** A change of the peer was stored: count it, and fetch the files a moment later. */
  onReceived () {
    this.received += 1
    this.lastReceivedAt = Date.now()
    clearTimeout(this.filesTimer)
    this.filesTimer = setTimeout(() => {
      this.fetchFiles().catch((error) => logger.error(`Replication of the files of ${this.name} failed:`, error.message))
    }, FILES_DELAY)
  }

  /**
   * Fetches the files of the records received from the peer, one run at a time.
   * @returns {Promise<void>}
   */
  async fetchFiles () {
    clearTimeout(this.filesTimer)
    while (this.filesRunning) {
      await this.filesRunning
    }
    this.filesRunning = this.replicator.processReceived(this.name, this.peer.url).then(() => {}, (error) => {
      logger.error(`Replication of the files of ${this.name} failed:`, error.message)
    })
    try {
      await this.filesRunning
    } finally {
      this.filesRunning = null
    }
  }

  /**
   * @returns {{peer: string, peerId: string|null, direction: string, state: string, error: string|null, since: number|null, retryAt: number|null, received: number, lastReceivedAt: number|null}}
   */
  status () {
    return {
      peer: this.peer.url,
      peerId: this.peerId,
      direction: this.peer.direction || null,
      state: this.state,
      error: this.error,
      since: this.since,
      retryAt: this.retryAt,
      received: this.received,
      lastReceivedAt: this.lastReceivedAt
    }
  }
}

module.exports = { Link, RETRY_DELAYS, DEFAULT_POLL_INTERVAL }
