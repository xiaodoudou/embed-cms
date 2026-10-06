<template>
  <div class="multiselect-wrapper">
    <v-autocomplete
      :id="selectOptions.id || inputId" ref="input"
      v-model:search="searchText"
      :name="schema.model"
      :theme="theme"
      :chips="getSelectOpt('chips')"
      :menu-props="menuProps"
      :model-value="selection" :items="listItems" :closable-chips="getSelectOpt('deletableChips') || getSelectOpt('multiple')" :hide-selected="getSelectOpt('hideSelected')"
      :disabled="disabled || schema.disabled" :readonly="!!schema.readonly" :aria-readonly="schema.readonly ? 'true' : undefined" :placeholder="schema.placeholder" :multiple="getSelectOpt('multiple')" :ripple="false" :flat="get('flat')" :rules="[validateField]"
      :item-title="customLabel" :item-value="getValue"
      menu-icon="$chevronDown" :clearable="isClearable" clear-icon="$close" :variant="getVariant()" :density="get('density')" rounded hide-details="auto" validate-on="blur" :aria-label="schema.label"
      @update:model-value="updateSelected" @search-change="onSearchChange" @tag="addTag"
      @update:focused="onFieldFocus"
    >
      <template #prepend>
        <field-label :schema="schema" :disabled="disabled" :label="getLabel()" :input-id="selectOptions.id || inputId" />
        <span v-if="getSelectOpt('multiple') && selectedCount > 0" class="selected-count" aria-live="polite">{{ $filters.translate('TL_N_SELECTED', { num: selectedCount }) }}</span>
        <v-btn v-if="schema.listBox" variant="tonal" size="small" rounded elevation="0" @click="onChangeSelectAll">{{ $filters.translate(allOptionsSelected() ? 'TL_DESELECT_ALL' : 'TL_SELECT_ALL') }}</v-btn>
      </template>
      >
      <template #chip="{ props, item }">
        <v-chip
          v-bind="props" :close-label="$filters.translate('TL_REMOVE_NAMED', { name: item.title })"
          @contextmenu.stop.prevent="copyToClipboard(item.value)"
        />
      </template>
      <template #append />
      <template #item="{props, item}">
        <v-list-item density="compact" v-bind="props" :subtitle="subtitleOf(item)">
          <template #title>
            <span class="option-title"><template v-for="(part, i) in highlight(customLabel(item))" :key="i"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
          </template>
        </v-list-item>
      </template>
      <template #no-data>
        <v-list-item density="compact" :title="$filters.translate('TL_NO_MATCHES')" class="option-empty" />
      </template>
    </v-autocomplete>
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>
<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import TranslateService from '@s/TranslateService'
  import Notification from '@m/Notification'
  import Mustache from 'mustache'
  import { highlightSegments, withGroupHeadings } from '@u/highlight'
  import { keyRef, toKey } from '@u/sources'

  export default {
    mixins: [AbstractField, Notification],
    emits: ['input'],
    data () {
      return {
        searchText: '',
        objectValue: this._value,
        menuProps: {
          offset: 6,
          maxHeight: 320,
          contentProps: {
            density: 'compact'
          }
        }
      }
    },
    computed: {
      // Single selects can be cleared unless the field is required; multi selects have closable chips
      isClearable () {
        if (this.getSelectOpt('clearable')) {
          return true
        }
        return !this.getSelectOpt('multiple') && !this.schema.required && !this.schema.readonly && !this.disabled
      },
      /** @returns {boolean} the records of several resources (`sources`): the choices are grouped by resource and what is kept is `{ resource, id }` */
      multiSource () {
        return !!this.schema.multiSource
      },
      /** @returns {*} what the list shows as chosen: the choices by their keys for a field of several resources, the value as it is for the others */
      selection () {
        const value = this.objectValue || this._value
        if (!this.multiSource) {
          return value
        }
        return _.isArray(value) ? _.compact(_.map(value, toKey)) : toKey(value)
      },
      // options.groupBy names a field of the option records that becomes the group heading
      listItems () {
        if (this.multiSource) {
          return withGroupHeadings(this.options, (item) => item._title)
        }
        const groupBy = _.get(this.schema, 'options.groupBy', false)
        const options = this.options
        if (!groupBy || !_.isArray(options)) {
          return options
        }
        return withGroupHeadings(options, (item) => _.get(item, groupBy))
      },
      /** @returns {number} */
      selectedCount () {
        return _.size(this.objectValue || this._value)
      },
      /** @returns {Object} schema.selectOptions, or {} */
      selectOptions () {
        return this.schema.selectOptions || {}
      },
      /** @returns {Array} schema.values, called with the model and the schema when it is a function */
      options () {
        const values = this.schema.values
        if (_.isFunction(values)) {
          return values.apply(this, [this.model, this.schema])
        }
        if (this.multiSource) {
          // a reference to a record that is gone is still shown, by its id, so that the value is not lost without being seen
          const value = this.objectValue || this._value
          const missing = _.filter(_.map(_.isArray(value) ? value : [value], toKey), key => key && !_.some(values, { _id: key }))
          return _.concat(values || [], _.map(missing, key => ({ _id: key, _label: `${keyRef(key).id} (${TranslateService.get('TL_MAP_RECORD_MISSING')})`, _title: '', missing: true })))
        }
        return values
      }
    },
    methods: {
      /**
       * @param {string} text
       * @returns {Array} the text cut into segments, the ones matching the search text flagged (highlightSegments)
       */
      highlight (text) {
        return highlightSegments(text, this.searchText)
      },
      // Secondary line: options.subtitle (a Mustache template over the option) or the id of records from another resource
      subtitleOf (item) {
        const raw = _.get(item, 'raw', item)
        if (!_.isObject(raw)) {
          return undefined
        }
        const template = _.get(this.schema, 'options.subtitle', false)
        if (template) {
          const rendered = Mustache.render(template, raw)
          return _.includes(rendered, '[object Object]') ? undefined : rendered
        }
        if (this.multiSource) {
          // the groups say what kind of record it is; a search leaves their headings out, so the kind is said under the record then
          return this.searchText ? _.get(raw, '_title') || undefined : undefined
        }
        return _.isString(this.schema.source) ? _.get(raw, '_id') : undefined
      },
      /**
       * @param {*} val
       * @returns {boolean} null, undefined, an empty string or an empty array
       */
      valEmpty(val) {
        return _.isNull(val) || _.isUndefined(val) || val === '' || (_.isArray(val) && val.length === 0)
      },
      /** @param {string} value */
      copyToClipboard(value) {
        navigator.clipboard.writeText(value)
        this.notify('Value has been copied.')
      },
      /**
       * @param {*} val
       * @returns {true|string} true, or the message: required when empty, invalid format when the validator of the schema refuses it
       */
      validateField (val) {
        if (this.valEmpty(val)) {
          return this.schema.required ? TranslateService.get('TL_FIELD_IS_REQUIRED') : true
        } else if (_.isFunction(this.schema.validator)) {
          return this.schema.validator(val, this.schema.model, this.model) ? true : TranslateService.get('TL_INVALID_FORMAT')
        }
        return true
      },
      /**
       * @param {Object|*} item an option, or Vuetify's {raw}
       * @returns {*} its _id, else its _value, else itself
       */
      getValue (item) {
        const val = _.get(item, 'raw', item)
        return _.get(val, '_id', _.get(val, '_value', val))
      },
      /**
       * @param {Object|*} item an option, or Vuetify's {raw}
       * @returns {string} its label: options.labels for a plain value (a string, or one per locale), the field of a record in the locale, its text, else selectOptions.customLabel
       */
      customLabel (item) {
        const val = _.get(item, 'raw', item)
        if (this.multiSource) {
          // (the headings of the groups are entries of the list too: they have a title)
          return _.toString(_.get(val, '_label', _.get(val, 'title', '')))
        }
        // plain values can carry a readable label: a string, or one string per locale
        const label = _.isObject(val) ? undefined : _.get(this.schema, ['options', 'labels', val])
        if (_.isString(label)) {
          return label
        } else if (_.isObject(label)) {
          return _.get(label, this.schema.locale, _.first(_.values(label)) || val)
        } else if (!_.get(this.schema, 'localised', false)) {
          return this.schema.selectOptions.customLabel(val)
        } else if (_.get(val, '_id', false)) {
          const fieldKey = _.first(_.without(_.keys(val), '_id'))
          return _.get(val, `${fieldKey}.${this.schema.locale}`, _.get(val, fieldKey, val))
        } else if (_.get(val, 'text', false)) {
          return val.text
        }
        return this.schema.selectOptions.customLabel(val)
      },
      /**
       * @param {string} key
       * @returns {*} selectOptions[key], false when unset
       */
      getSelectOpt (key) {
        return _.get(this.selectOptions, key, false)
      },
      /** @returns {boolean} */
      allOptionsSelected () {
        return _.get(this.options, 'length', 0) === _.get(this.objectValue || this._value, 'length', 0)
      },
      /** Deselects everything when all is selected, else selects every option. */
      onChangeSelectAll () {
        const allSelected = this.allOptionsSelected()
        if (allSelected) {
          this.objectValue = []
        } else if (this.multiSource) {
          this.objectValue = _.map(_.reject(this.options, 'missing'), '_id')
        } else {
          let allValues = _.compact(_.map(this.options, '_value'))
          if (_.get(allValues, 'length', 0) === 0) {
            allValues = this.options
          }
          this.objectValue = allValues
        }
        this._value = this.multiSource ? _.compact(_.map(this.objectValue, keyRef)) : this.objectValue
        this.$emit('input', this._value, this.schema.model)
      },
      /** @returns {string} selectOptions.label, else the label of the schema; empty when disabled */
      getLabel () {
        if (this.disabled) {
          return ''
        }
        return !_.isString(this.selectOptions.label) ? this.schema.label : this.selectOptions.label
      },
      /** @param {Array|Object|string} value the selection; stored by selectOptions.key when there is one */
      updateSelected (value) {
        this.objectValue = value
        if (this.multiSource) {
          this.$emit('input', _.isArray(value) ? _.compact(_.map(value, keyRef)) : (_.isNil(value) ? value : keyRef(value)), this.schema.model)
          return
        }
        const key = _.get(this.schema, 'selectOptions.key', false)
        if (key) {
          value = _.isString(value) ? value : _.get(value, key, value)
        }
        this.$emit('input', value, this.schema.model)
      },
      /**
       * @param {string} newTag
       * @param {string} id the field; both handed to selectOptions.onNewTag when there is one
       */
      addTag (newTag, id) {
        const onNewTag = this.selectOptions.onNewTag
        if (_.isFunction(onNewTag)) {
          onNewTag(newTag, id, this.options, this.objectValue)
        }
      },
      /**
       * @param {string} searchQuery
       * @param {string} id the field; both handed to selectOptions.onSearch when there is one
       */
      onSearchChange (searchQuery, id) {
        const onSearch = this.selectOptions.onSearch
        if (_.isFunction(onSearch)) {
          onSearch(searchQuery, id, this.options)
        }
      }
    }
  }
</script>

<style lang="scss">
.multiselect-wrapper {
  .v-input__prepend {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cms-space-3);
    width: 100%;
    .selected-count {
      margin-left: auto;
      color: var(--cms-text-muted);
      font-size: var(--cms-fs-sm);
    }
  }
  // Tags: even gaps, room inside the field, capped height with inner scroll
  .v-autocomplete.v-autocomplete--chips .v-field__input,
  .v-autocomplete.v-autocomplete--multiple .v-field__input,
  .v-autocomplete.v-select--chips .v-field__input,
  .v-autocomplete.v-select--multiple .v-field__input {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--cms-space-2);
    // the same room above the first row of tags and below the last, whatever Vuetify's density sets
    padding: var(--cms-space-3);
    padding-block: var(--cms-space-3);
    row-gap: var(--cms-space-2);
  }
  .v-autocomplete.v-autocomplete--chips,
  .v-autocomplete.v-autocomplete--multiple,
  .v-autocomplete.v-select--chips,
  .v-autocomplete.v-select--multiple {
    --v-field-padding-top: var(--cms-space-3);
    --v-field-padding-bottom: var(--cms-space-3);
  }
  .v-field__input {
    max-height: 216px;
    overflow-y: auto;
  }
  .v-autocomplete .v-field__append-inner {
    align-items: flex-start;
    padding-top: var(--cms-space-3);
  }
  .v-autocomplete .v-autocomplete__selection {
    margin: 0;
    height: auto;
  }
  .v-autocomplete .v-field__input input {
    min-height: 28px;
    padding: 0;
  }
  .v-autocomplete {
    // input {
    //   position: absolute;
    // }
    .v-chip {
      &:hover {
        background: var(--cms-overlay-strong);
        cursor: copy;
      }
    }
    &.v-autocomplete--chips,
    &.v-select--chips {
      input {
        padding: 0;
        height: 100%;
        max-height: 100%;
      }
    }
  }
  .v-select__selections {
    .v-chip--select {
      &:first-child {
        margin-left: 0px;
      }
    }
  }
}
</style>
