import Emitter from 'tiny-emitter'

class DialogService {
  constructor () {
    this.events = new Emitter()
  }

  send (isEditing) {
    this.events.emit('dialog', isEditing)
  }

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

  confirm (data) {
    this.events.emit('dialog:confirm', data)
  }
}

export default new DialogService()
