<template>
  <div class="custom-input">
    <v-text-field
      :id="inputId" ref="input"
      :theme="theme" :class="[schema.labelClasses]" :type="getType()" :model-value="_value"
      :max-length="schema.max" :min-length="schema.min" autocomplete="off" validate-on="blur" :rules="[validateField]"
      :variant="getVariant()" :flat="get('flat')" :rounded="get('rounded')" :density="get('density')" :disabled="disabled" :readonly="get('readonly')" :aria-readonly="get('readonly') ? 'true' : undefined"
      persistent-placeholder hide-details="auto" :aria-label="schema.label" :aria-required="schema.required ? 'true' : undefined" @update:model-value="onChangeData" @update:focused="onFieldFocus"
    >
      <template #prepend><field-label :schema="schema" :disabled="disabled" :input-id="inputId" /></template>
    </v-text-field>
    <div v-if="showHint()" class="help-block">
      <v-icon size="small" icon="$information" />
      <span>{{ schema.options.hint }}</span>
    </div>
  </div>
</template>

<script>
  import _ from 'lodash'
  import AbstractField from '@m/AbstractField'
  import { toStoredNumber, NUMBER_INPUTS } from '@u/fieldValidation'

  export default {
    mixins: [AbstractField],
    methods: {
      /** @returns {string} schema.inputFieldType, text by default */
      getType () {
        return _.get(this.schema, 'inputFieldType', 'text')
      },
      // number inputs store numbers, not the text that was typed
      onChangeData (data) {
        this._value = _.includes(NUMBER_INPUTS, this.schema.input) ? toStoredNumber(data) : data
      }
    }
  }
</script>
