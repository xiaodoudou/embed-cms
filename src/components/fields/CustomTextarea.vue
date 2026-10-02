<template>
  <div class="custom-textarea">
    <v-textarea
      ref="input" :class="[schema.labelClasses]" :type="getType()" :model-value="_value" :max-length="schema.max" :min-length="schema.min" auto-grow :density="get('density')" :flat="get('flat')" :disabled="schema.disabled"
      :readonly="schema.readonly" :aria-readonly="schema.readonly ? 'true' : undefined" :rules="[validateField]" hide-details="auto" validate-on="blur" :aria-label="schema.label" :variant="getVariant()" :rounded="get('rounded')" @update:model-value="onChangeData" @update:focused="onFieldFocus"
    >
      <template #prepend><field-label :schema="schema" :disabled="disabled" /></template>
      <template #label />
    </v-textarea>
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

  export default {
    mixins: [AbstractField],
    methods: {
      getType () {
        return _.get(this.schema, 'inputFieldType', 'text')
      },
      validateField (val) {
        return validateFieldValue(this.schema, val) || true
      }
    }
  }
</script>

<style lang="scss">
@use '@a/scss/variables.scss' as *;
@use '@a/scss/mixins.scss' as *;
  .custom-textarea {
    .v-field__input {
      padding-top: 8px;
    }
    textarea {
      @include textarea-text;
    }
  }
</style>
