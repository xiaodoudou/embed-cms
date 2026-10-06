import Emitter from 'tiny-emitter'

class DialogService {
  constructor () {
    this.events = new Emitter()
  }

  /** @param {boolean} isEditing emitted as dialog */
  send (isEditing) {
    this.events.emit('dialog', isEditing)
  }

  /** @param {Object} data the dialog: event, title, message, callback, onCancel */
  show (data) {
    /*
      {
        event: 'selectRecord',
        callback: ()=> yourCallback(),
        title: 'Title',
        message: 'Message',
        cancel: 'Cancel',
        confirm: 'Confirm',
      }
    */
    this.events.emit('dialog:show', data)
  }

  /**
   * Promise based confirmation through the shared dialog: resolves true on confirm,
   * false on cancel/Escape. Same options as show().
   */
  ask (data) {
    return new Promise((resolve) => {
      this.show({ ...data, callback: () => resolve(true), onCancel: () => resolve(false) })
    })
  }

  /** @param {Object} data emitted as dialog:confirm */
  confirm (data) {
    this.events.emit('dialog:confirm', data)
  }
}

export default new DialogService()
