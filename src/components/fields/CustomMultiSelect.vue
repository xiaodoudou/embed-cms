<template>
  <div class="multiselect-wrapper">
    <v-autocomplete
      :id="selectOptions.id"
      ref="input"
      v-model:search="searchText"
      :theme="theme"
      :chips="getSelectOpt('chips')"
      :menu-props="menuProps"
      :model-value="objectValue || _value" :items="listItems" :closable-chips="getSelectOpt('deletableChips') || getSelectOpt('multiple')" :hide-selected="getSelectOpt('hideSelected')"
      :disabled="disabled || schema.disabled" :readonly="!!schema.readonly" :aria-readonly="schema.readonly ? 'true' : undefined" :placeholder="schema.placeholder" :multiple="getSelectOpt('multiple')" :ripple="false" :flat="get('flat')" :rules="[validateField]"
      :item-title="customLabel" :item-value="getValue"
      menu-icon="$chevronDown" :clearable="isClearable" clear-icon="$close" :variant="getVariant()" :density="get('density')" rounded hide-details="auto" validate-on="blur" :aria-label="schema.label"
      @update:model-value="updateSelected" @search-change="onSearchChange" @tag="addTag"
      @update:focused="onFieldFocus"
    >
      <template #prepend>
        <field-label :schema="schema" :disabled="disabled" :label="getLabel()" />
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
      <template #label />
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

  export default {
    mixins: [AbstractField, Notification],
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
      // options.groupBy names a field of the option records that becomes the group heading
      listItems () {
        const groupBy = _.get(this.schema, 'options.groupBy', false)
        const options = this.options
        if (!groupBy || !_.isArray(options)) {
          return options
        }
        return withGroupHeadings(options, (item) => _.get(item, groupBy))
      },
      selectedCount () {
        return _.size(this.objectValue || this._value)
      },
      selectOptions () {
        return this.schema.selectOptions || {}
      },
      options () {
        let values = this.schema.values
        if (_.isFunction(values)) {
          return values.apply(this, [this.model, this.schema])
        }
        return values
      }
    },
    methods: {
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
        return _.isString(this.schema.source) ? _.get(raw, '_id') : undefined
      },
      valEmpty(val) {
        return _.isNull(val) || _.isUndefined(val) || val === '' || (_.isArray(val) && val.length === 0)
      },
      copyToClipboard(value) {
        navigator.clipboard.writeText(value)
        this.notify('Value has been copied.')
      },
      validateField (val) {
        if (this.valEmpty(val)) {
          return this.schema.required ? TranslateService.get('TL_FIELD_IS_REQUIRED') : true
        } else if (_.isFunction(this.schema.validator)) {
          return this.schema.validator(val, this.schema.model, this.model) ? true : TranslateService.get('TL_INVALID_FORMAT')
        }
        return true
      },
      getValue (item) {
        const val = _.get(item, 'raw', item)
        return _.get(val, '_id', _.get(val, '_value', val))
      },
      customLabel (item) {
        const val = _.get(item, 'raw', item)
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
      getSelectOpt (key) {
        return _.get(this.selectOptions, key, false)
      },
      allOptionsSelected () {
        return _.get(this.options, 'length', 0) === _.get(this.objectValue || this._value, 'length', 0)
      },
      onChangeSelectAll () {
        const allSelected = this.allOptionsSelected()
        if (allSelected) {
          this.objectValue = []
        } else {
          let allValues = _.compact(_.map(this.options, '_value'))
          if (_.get(allValues, 'length', 0) === 0) {
            allValues = this.options
          }
          this.objectValue = allValues
        }
        this._value = this.objectValue
        this.$emit('input', this._value, this.schema.model)
      },
      getLabel () {
        if (this.disabled) {
          return ''
        }
        return !_.isString(this.selectOptions.label) ? this.schema.label : this.selectOptions.label
      },
      updateSelected (value) {
        this.objectValue = value
        const key = _.get(this.schema, 'selectOptions.key', false)
        if (key) {
          value = _.isString(value) ? value : _.get(value, key, value)
        }
        this.$emit('input', value, this.schema.model)
      },
      addTag (newTag, id) {
        const onNewTag = this.selectOptions.onNewTag
        if (_.isFunction(onNewTag)) {
          onNewTag(newTag, id, this.options, this.objectValue)
        }
      },
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
