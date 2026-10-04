import { log } from '@u/log'
import _ from 'lodash'
import { createApp, h } from 'vue'
import * as Vue from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import JsonViewer from 'vue-json-viewer'
import VueCookies from 'vue-cookies'
import shortkey from '@u/shortkey'
import VueVirtualScroller from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { VueDraggableNext } from 'vue-draggable-next'
import vuetify from './vuetify.js'
import '@p/js/main.js'
import './styles/reset.scss'
import './styles/tokens.scss'
import './styles/base.scss'
import './styles/primitives.scss'
import './styles/kit.scss'
import '@a/scss/main.scss'
import '@p/scss/main.scss'

// Global components
import App from '@c/App.vue'
import LoginApp from '@c/LoginApp.vue'
import CustomForm from '@c/records/CustomForm.vue'

// Pages
import PluginPage from '@c/pages/PluginPage.vue'
import Syslog from '@c/pages/Syslog.vue'
import CmsImport from '@c/pages/CmsImport.vue'
import SyncResource from '@c/pages/SyncResource.vue'
import CmsReplicator from '@c/pages/CmsReplicator.vue'

// Field components
import FieldLabel from '@c/fields/FieldLabel.vue'
import CustomTreeView from '@c/fields/CustomTreeView.vue'
import CustomCode from '@c/fields/CustomCode.vue'
import ColorPicker from '@c/fields/ColorPicker.vue'
import JsonEditor from '@c/fields/JsonEditor.vue'
import WysiwygField from '@c/fields/Wysiwyg.vue'
import ParagraphView from '@c/fields/ParagraphView.vue'
import ImageView from '@c/fields/ImageView.vue'
import AttachmentView from '@c/fields/AttachmentView.vue'
import CustomDatetimePicker from '@c/fields/CustomDatetimePicker.vue'
import CustomMultiSelect from '@c/fields/CustomMultiSelect.vue'
import CustomInput from '@c/fields/CustomInput.vue'
import CustomTextarea from '@c/fields/CustomTextarea.vue'
import CustomCheckbox from '@c/fields/CustomCheckbox.vue'
import CustomInputTag from '@c/fields/CustomInputTag.vue'
import Transliterate from '@c/fields/Transliterate.vue'
import Group from '@c/fields/Group.vue'

import Loading from './utils/loadingPlugin'

import TranslateFilter from '@f/translate'
import TruncateFilter from '@f/truncate'
import TranslateService from '@s/TranslateService'
import RequestService from '@s/RequestService.js'
import DialogService from '@s/DialogService.js'
import { host } from '@s/HostService'
import { pluginPages } from '@u/pluginPages'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [ { path: '/', component: App } ]
})

const app = createApp({
  /** @returns {VNode} the App; without a #app element, the App alone */
  render: () => {
    const mountEl = document.querySelector('#app')
    if (!mountEl) {
      return h(App)
    }
    return h(mountEl.getAttribute('type') === 'login' ? LoginApp : App)
  }
})
// the host: what a plugin of the admin may rely on (window.embedCms.host, useAdmin(), this.$admin)
app.host = host.start()
app.provide('host', host)
app.config.globalProperties.$admin = host
window.embedCms = app
app.config.globalProperties.$filters = {
  translate: TranslateFilter,
  truncate: TruncateFilter
}
app.use(router)
  .use(vuetify)

// // Vue.config.devtools = false
  .component('CustomForm', CustomForm)
  .component('FieldLabel', FieldLabel)
  .component('AttachmentView', AttachmentView)
  .component('ImageView', ImageView)
  .component('CustomInput', CustomInput)
  .component('CustomTextarea', CustomTextarea)
  .component('CustomCheckbox', CustomCheckbox)
  .component('ParagraphView', ParagraphView)
  .component('CustomTreeView', CustomTreeView)
  .component('CustomCode', CustomCode)
  .component('ColorPicker', ColorPicker)
  .component('JsonEditor', JsonEditor)
  .component('WysiwygField', WysiwygField)
  .component('CustomDatetimePicker', CustomDatetimePicker)
  .component('Group', Group)
  .component('CustomInputTag', CustomInputTag)
  .component('Transliterate', Transliterate)
  .component('CustomMultiSelect', CustomMultiSelect)
  .component('PluginPage', PluginPage)
  .component('Syslog', Syslog)
  .component('CmsImport', CmsImport)
  .component('SyncResource', SyncResource)
  .component('CmsReplicator', CmsReplicator)
  .component('Draggable', VueDraggableNext)
  .component('date-picker', VueDatePicker)
  .use(JsonViewer)
  .use(VueCookies)
  .use(Loading)
  .use(VueVirtualScroller)
  .directive('shortkey', shortkey)

/**
 * @param {string} title
 * @param {string} displayName
 * @param {string} group
 * @param {Array<string>} allowed the groups that see it
 * @param {string} label
 */
function addPlugin (title, displayName, group = 'System', allowed = ['admins'], label = displayName) {
  window.plugins = window.plugins || []
  log.debug('adding plugin', displayName)
  window.plugins.push({
    title,
    displayname: displayName,
    label,
    component: title,
    group,
    allowed,
    type: 'plugin',
    pluginComponent: title
  })
}

window.addEventListener('load', async function () {
  window.DialogService = DialogService
  _.each(window.plugins, item => {
    item.type = 'plugin'
  })
  window.TranslateService = TranslateService
  const config = await RequestService.get(`${window.location.pathname}config`)
  _.each(pluginPages(config), (page) => addPlugin(page.title, page.displayname, page.group, undefined, page.label))
  window.disableJwtLogin = _.get(config, 'disableJwtLogin', false)
  window.noLogin = window.disableJwtLogin && _.get(config, 'disableAuthentication', false)
  app.mount('#app')
  window.embedCms = app
})
window.Vue = Vue
