import RequestService from '@s/RequestService'

class ConfigService {
  constructor () {
    this.config = {}
  }

  /** Loads the config of the server into this.config. */
  async init () {
    try {
      this.config = await RequestService.get(`${window.location.pathname}config`)
    } catch (error) {
      console.error('Error during init of ConfigService:', error)
    }
  }
}

export default new ConfigService()
