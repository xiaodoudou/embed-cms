// import _ from 'lodash'
import Emitter from 'tiny-emitter'

class FieldSelectorService {
  constructor () {
    this.events = new Emitter()
  }

  /** @param {Object} field emitted as select */
  select (field) {
    this.events.emit('select', field)
  }

  /**
   * @param {number} paragraphLevel
   * @param {number} index -1 clears
   */
  highlightParagraph(paragraphLevel, index) {
    this.events.emit('highlight-paragraph', paragraphLevel, index)
  }
}

export default new FieldSelectorService()
