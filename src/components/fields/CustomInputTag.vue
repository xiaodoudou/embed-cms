<template>
  <div class="custom-input-tag">
    <v-combobox
      ref="input"
      :theme="theme" :class="[schema.labelClasses]" :type="getType()" :model-value="_value" :input-value="_value" :items="suggestions"
      :max-length="schema.max" :min-length="schema.min" autocomplete="off" validate-on-submit :rules="[validateField]" persistent-placeholder hide-details="auto" chips closable-chips multiple
      :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :disabled="disabled" :readonly="get('readonly')" clearable
      @update:model-value="onChangeData" @update:focused="onFieldFocus" @paste="onPaste"
    >
      <template #prepend><field-label :schema="schema" :disabled="disabled" /></template>
      <template #label />
      <template #chip="{ props, item }">
        <v-chip
          v-bind="props"
          @contextmenu.stop.prevent="copyToClipboard(item.value)"
        />
      </template>
    </v-combobox>
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import { validateFieldValue } from '@u/fieldValidation'
  import Notification from '@m/Notification'

  export default {
    mixins: [AbstractField, Notification],
    computed: {
      // the drop-down of a field that suggests values: `options.suggest: 'adminPlugins'` lists the plugin pages this admin has
      // (the built-in ones that run, and those of the project), so that a group is given them by picking, not by typing a name
      suggestions () {
        if (_.get(this.schema, 'options.suggest') === 'adminPlugins') {
          return _.uniq(_.compact(_.map(window.plugins, 'displayname')))
        }
        return []
      }
    },
    methods: {
      getType () {
        return _.get(this.schema, 'inputFieldType', 'text')
      },
      validateField (val) {
        return validateFieldValue(this.schema, val) || true
      },
      copyToClipboard(value) {
        navigator.clipboard.writeText(value)
        this.notify('Value has been copied.')
      },
      onChangeData(newValue) {
        // Process the new value to handle comma-separated strings
        const processedValue = this.processCommaSeparatedValues(newValue)
        this.$emit('input', processedValue, this.schema.model)
      },
      onPaste(event) {
        // Handle paste event to automatically split comma-separated values
        event.preventDefault()
        const pastedText = (event.clipboardData || window.clipboardData).getData('text')

        if (pastedText && pastedText.includes(',')) {
          // Split by comma and clean up the values
          const newTags = pastedText
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0)

          // Merge with existing values, avoiding duplicates
          const currentValues = this._value || []
          const mergedValues = [...currentValues, ...newTags.filter(tag => !currentValues.includes(tag))]

          this.$emit('input', mergedValues, this.schema.model)
        } else {
          // If no comma, treat as single tag
          const currentValues = this._value || []
          const trimmedText = pastedText.trim()
          if (trimmedText && !currentValues.includes(trimmedText)) {
            this.$emit('input', [...currentValues, trimmedText], this.schema.model)
          }
        }
      },
      processCommaSeparatedValues(value) {
        if (!value || !Array.isArray(value)) {
          return value
        }

        const processedValues = []

        value.forEach(item => {
          if (typeof item === 'string' && item.includes(',')) {
            // Split comma-separated string into individual tags
            const splitTags = item
              .split(',')
              .map(tag => tag.trim())
              .filter(tag => tag.length > 0)
            processedValues.push(...splitTags)
          } else {
            processedValues.push(item)
          }
        })

        // Remove duplicates
        return [...new Set(processedValues)]
      }
    }
  }
</script>

<style lang="scss">
.v-field {
  .v-chip {
    &:hover {
      background: var(--cms-overlay-strong);
      cursor: copy;
    }
  }
}
</style>
