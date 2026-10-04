import fs from 'node:fs'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { mdi } from 'vuetify/iconsets/mdi-svg'
import TranslateService from '@s/TranslateService'
import { iconAliases } from '@u/iconAliases'
import TranslateFilter from '@f/translate'
import TruncateFilter from '@f/truncate'
import FieldLabel from '@c/fields/FieldLabel.vue'
import shortkey from '@u/shortkey'

// The real English dictionary, so that tests read the words a person sees (and a renamed key fails them)
TranslateService.dict.enUS = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../i18n/enUS.json'), 'utf8'))
TranslateService.locale = 'enUS'

/**
 * Mounts a component the way the app does: Vuetify, the $filters global, the field label and the shortcut directive.
 * `model` and `schema` are the props every field receives; other mounting options are passed through.
 */
export function mountComponent (component, options = {}) {
  const vuetify = createVuetify({ components, directives, icons: { defaultSet: 'mdi', aliases: iconAliases, sets: { mdi } } })
  const extra = options.global || {}
  return mount(component, {
    ...options,
    global: {
      ...extra,
      // what a test adds (components, plugins, mocks like $loading) comes on top of the app's own environment
      plugins: [vuetify, ...(extra.plugins || [])],
      components: { FieldLabel, ...(extra.components || {}) },
      directives: { shortkey, ...(extra.directives || {}) },
      config: { ...(extra.config || {}), globalProperties: { $filters: { translate: TranslateFilter, truncate: TruncateFilter }, ...(extra.config?.globalProperties || {}) } }
    }
  })
}

export function mountField (component, { model = {}, schema = {}, ...rest } = {}) {
  // a field is given the look every type of field has in the app (FormService)
  return mountComponent(component, { ...rest, props: { model, schema: { model: 'value', label: 'Label', density: 'compact', rounded: true, flat: true, 'solo-filled': true, ...schema }, ...(rest.props || {}) } })
}

export { TranslateService }
