import LoadingService from '@s/LoadingService'

const Loading = {
  /**
   * @param {import('vue').App} app
   * @param {Object} options
   */
  install (app, options) {
    this.params = options
    app.config.globalProperties.$loading = LoadingService
  }
}

export default Loading
