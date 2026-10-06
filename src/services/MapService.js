import RequestService from '@s/RequestService'

const NONE = { enabled: false }

/** What the server says of the map of the geopoint field (`maps` option): whether there is one, the tiles and the search. Asked once, when a field needs it. */
class MapService {
  constructor () {
    this.pending = null
  }

  /**
   * @returns {Promise<{enabled: boolean, tiles?: Object, search?: Object|null}>} the map; none when it is turned off or the server does not answer (the field is then its two boxes)
   */
  load () {
    if (!this.pending) {
      this.pending = RequestService.get(`${window.location.pathname}maps`).catch(() => {
        // asked again the next time: the person may not have been logged in yet
        this.pending = null
        return NONE
      })
    }
    return this.pending
  }

  /** Forgets the answer, so that the next load asks the server again. */
  reset () {
    this.pending = null
  }
}

export default new MapService()
